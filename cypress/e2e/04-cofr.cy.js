/**
 * Test Objective: COFR — Centralized Order Fulfillment Request (DWMS)
 * Business Scenario: Validates the COFR Inside Sales workflow using the Funnel No captured from the upstream CRM integration.
 * 
 * Workflow Steps:
 * 1. Inside Sales Activation — Search by Funnel No and initiate workflow (maliff).
 * 2. Inside Sales (FM) Claim — Claim queued record and populate provisioning metadata (izwah).
 * 3. Head of Dept Review — Authorize submission (nizam.kadir).
 * 4. CM Credit Verification — Evaluate and approve credit status (juliuse).
 * 5. Submission Verification — Await COMPLETED stage and invoke downstream integration cron (izwah).
 * 
 * Pipeline position: T2Q → ESO → CRM → COFR
 * Post-conditions: Drives DWMS state to COMPLETED and signals ATOM via API hook.
 */

/**
 * Helper Function: Find and Open Submission (with Automated Retry)
 * Purpose: Locates a specific submission record in the queue and accesses its detail view.
 * Business Context: DWMS workflow propagation is asynchronous; submissions may experience a delay before rendering in user queues.
 * 
 * @param {string} submissionNo - Submission number to search for
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 */
function findAndOpenSubmission(submissionNo, maxRetries = 3) {
    let retriesLeft = maxRetries;

    const attemptFind = () => {
        cy.get("body", { timeout: 10000 }).then(($body) => {
            if ($body.text().includes(submissionNo)) {
                cy.contains(submissionNo).should("be.visible").click();
            } else if (retriesLeft > 0) {
                cy.log(
                    `⚠ Submission ${submissionNo} not visible — retrying (${retriesLeft} attempts left)`,
                );
                retriesLeft--;
                cy.reload();
                cy.get("body", { timeout: 10000 }).should("be.visible");
                attemptFind();
            } else {
                throw new Error(
                    `Submission ${submissionNo} not found after ${maxRetries} retry attempts.\n` +
                    `Possible causes:\n` +
                    `  - Workflow propagation delay (submissions may take time to appear in queues)\n` +
                    `  - Data mismatch (verify submissionNo is correct)\n` +
                    `  - Session/permission issue (verify user has access to this queue)`,
                );
            }
        });
    };

    attemptFind();
}

describe("COFR - Centralized Order Fulfillment Request", () => {
    // Preconditions: Define environment constants and shared state variables
    const DWMS_BASE_URL = Cypress.env("DWMS_BASE_URL");

    // ────────────────────────────────────────────
    // DOM Selector Constants (ASP.NET FormEngine GUIDs)
    // ────────────────────────────────────────────
    const SEL = {
        tabularList:
            "ctl00$ContentPlaceHolder1$TabularList1$dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72",

        funnelNoInput:
            "ctl00$ContentPlaceHolder1$FormEngine1$mf_50e1317e-8f92-4e23-8687-0f2e1885c90b",

        accountGroup:
            "ctl00$ContentPlaceHolder1$FormEngine1$mf_0271e87c-69fd-411e-ab49-43d114a82c71$ddlGroup",

        soValueRadio:
            "ctl00$ContentPlaceHolder1$FormEngine1$Grpcc16ddd2-4ee1-4852-bddc-3985bb34be77",
        completeRadio:
            "ctl00$ContentPlaceHolder1$FormEngine1$Grp2e280a6f-7e66-4e6a-af70-0d348ca92ea2",
        rejectRadio:
            "ctl00$ContentPlaceHolder1$FormEngine1$Grp7226d68f-ee3e-4d73-a4a6-3f6c04a5069c",

        ctosDropdown:
            "ctl00$ContentPlaceHolder1$FormEngine1$mf_c9191352-2dfc-440a-82d8-49dd11d97202$ddlGroup",

        claimBtn: "6f1ef70d-77fb-404b-bf3d-bf0e40453fed",

        submitBtn: "ctl00$ContentPlaceHolder1$btnSave",
        lblMessage: "#ctl00_ContentPlaceHolder1_FormEngine1_lblMessage",
    };

    let funnelNo;

    // Preconditions: Load upstream test data from shared fixture
    before(function () {
        cy.requireUpstreamData(["funnelNo"]).then((data) => {
            funnelNo = data?.funnelNo;
        });
    });

    // Preconditions: Guard against test execution if prerequisites are missing at runtime
    beforeEach(function () {
        if (!funnelNo) this.skip();
    });

    // ────────────────────────────────────────────
    // Navigation Helpers
    // ────────────────────────────────────────────

    /**
     * Helper Function: Navigate from DWMS dashboard into COFR application
     * Purpose: Provides resilient contextual navigation across varying application grid layouts.
     */
    function openCOFR() {
        // Workflow Step: Access DWMS portal dashboard
        cy.visit(`${DWMS_BASE_URL}/myapplications.aspx`);

        // Workflow Step: Navigate to Centralized Order Fulfillment Request module
        cy.contains(".AppName_Link", "Centralized Order Fulfillment Request")
            .should("be.visible")
            .click();

        // Validation: Verify application module initializes successfully
        cy.get("#ctl00_ContentPlaceHolder1_AppTabTable", {
            timeout: 15000,
        }).should("be.visible");
    }

    // ────────────────────────────────────────────
    // Tests
    // ────────────────────────────────────────────

    /**
     * Test Objective: Inside Sales Activation
     * Business Scenario: Inside Sales representative searches by CRM Funnel No to inject an activation request into the DWMS queue.
     */
    it("Inside Sales Activation", function () {
        // Preconditions: Idempotency Guard - Skip if funnel activation was already executed in a previous run.
        cy.skipIfCompleted("activationCompleted");

        // Workflow Step: Authenticate to DWMS as Inside Sales Activation representative
        cy.loginDWMS(
            Cypress.env("DWMS_INSIDE_SALES_ACTIVATION_USERNAME"),
            Cypress.env("DWMS_INSIDE_SALES_ACTIVATION_PASSWORD"),
        );

        openCOFR();

        // Workflow Step: Access Inside Sales processing queue
        cy.contains(".app_TabLink", "Inside Sales")
            .should("be.visible")
            .click();

        // Validation: Synchronize with ASP.NET form postback to guarantee state
        cy.intercept("POST", "**/fillform.aspx*").as("formPostback");

        cy.contains(".fieldcontrol_cell label", "Activation", {
            timeout: 15000,
        }).should("be.visible");

        // Workflow Step: Assign Request Type (Activation)
        cy.contains(".fieldcontrol_cell label", "Activation").click();

        // Workflow Step: Filter by specific Funnel No criteria
        cy.waitOptional("@formPostback");
        cy.contains(".fieldcontrol_cell label", "Funnel No", { timeout: 10000 })
            .should("be.visible")
            .click();

        // Workflow Step: Enter Funnel No reference from upstream CRM pipeline
        cy.get(`[name="${SEL.funnelNoInput}"]`, { timeout: 10000 })
            .should("be.visible")
            .clear()
            .type(funnelNo, { delay: 0 })
            .should("have.value", funnelNo);

        cy.log(`✓ Funnel No entered: ${funnelNo}`);

        // Workflow Step: Initiate Request Configuration
        cy.get(
            '.fieldcontrol_cell button, .fieldcontrol_cell input[type="submit"]',
        )
            .first()
            .should("be.visible")
            .click();

        // Workflow Step: Upload required supporting documentation
        cy.intercept("POST", "**/fillform.aspx*").as("uploadPostback");

        cy.get(
            '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_3d895d7e-f373-46d1-a247-3f2b00aafbd3$fupWillWork"]',
        )
            .should("be.visible")
            .attachFile("README.md");

        cy.get(
            '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_3d895d7e-f373-46d1-a247-3f2b00aafbd3$btnUploadWillWork"]',
        )
            .should("be.visible")
            .click();

        cy.wait("@uploadPostback");

        cy.get('[name="ctl00$ContentPlaceHolder1$btnSave"]')
            .should("be.visible")
            .click();

        cy.wait("@uploadPostback");

        // Validation: Verify attachment ingestion and bind to submission
        cy.get(
            '[name="ctl00$ContentPlaceHolder1$FormEngine1$tbee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10$dgdee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10$ctl00_ContentPlaceHolder1_FormEngine1_tbee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10_dgdee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10_MainTable_0"]',
            { timeout: 10000 },
        ).should("be.visible");

        cy.get(
            '[name="ctl00$ContentPlaceHolder1$FormEngine1$tbee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10$dgdee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10$ctl00_ContentPlaceHolder1_FormEngine1_tbee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10_dgdee7c55f8-e3a2-4c4a-8365-4e1b95ce3b10_MainTable_0"]',
        ).check();

        cy.get('[name="ctl00$ContentPlaceHolder1$btnSave"]')
            .should("be.visible")
            .click();

        // Workflow Step: Acknowledge Legal / Policy Terms prior to request submission
        cy.get("body").then(function ($body) {
            const labelSelector = ".checkbox_normal > label";
            const errorSelector =
                "#ctl00_ContentPlaceHolder1_ValidationSummary1 > ul > :nth-child(1)";

            if (
                $body.find(labelSelector).length > 0 &&
                $body.find(labelSelector).is(":visible")
            ) {
                cy.log("Declaration label already visible — clicking it");
                cy.get(labelSelector).first().click();
            } else {
                cy.log(
                    "Declaration label not visible — clicking button to trigger postback",
                );
                cy.get("button").first().click();

                const combinedSelector = `${labelSelector}, ${errorSelector}`;
                cy.waitUntilVisible(combinedSelector, 15000).then(function () {
                    cy.get("body").then(function ($bodyAfter) {
                        // Validation: Intercept potential race conditions indicating workflow was concurrently executed
                        const $error = $bodyAfter.find(errorSelector);
                        if (
                            $error.length > 0 &&
                            $error
                                .text()
                                .includes(
                                    "You are not allow to enter Funnel No that submitted before.",
                                )
                        ) {
                            cy.log(
                                "⚠ Funnel already submitted according to DWMS validation error. Skipping.",
                            );
                            this.skip();
                            return;
                        }

                        const $label = $bodyAfter.find(labelSelector);
                        if ($label.length > 0 && $label.is(":visible")) {
                            cy.log("Declaration label appeared — clicking it");
                            cy.wrap($label.first()).click();
                        } else {
                            cy.log(
                                "⚠ Declaration label still not found after 15s — proceeding to Save",
                            );
                        }
                    });
                });
            }
        });
        cy.get('[name="ctl00$ContentPlaceHolder1$btnSave"]')
            .should("be.visible")
            .click();

        // Validation: Ensure application successfully redirects away from record creation
        cy.url({ timeout: 15000 }).should("not.include", "New=1");

        // Post-condition: Flag activation as functionally complete in shared fixture
        cy.task("mergeFixture", { activationCompleted: true });
        cy.log("✓ Inside Sales Activation completed successfully");
    });

    /**
     * Test Objective: Claim Funnel and Populate Inside Sales Form
     * Business Scenario: Inside Sales FM claims the queued request and populates essential provisioning criteria.
     */
    it("Inside Sales (FM) Claim", function () {
        // Preconditions: Idempotency Guard - Skip if funnel was previously claimed and submission generated.
        cy.skipIfCompleted("submissionNo");

        // Workflow Step: Authenticate to DWMS as Inside Sales FM representative
        cy.loginDWMS(
            Cypress.env("DWMS_INSIDE_SALES_FM_USERNAME"),
            Cypress.env("DWMS_INSIDE_SALES_FM_PASSWORD"),
        );

        openCOFR();

        // Workflow Step: Access Inside Sales Input queue view
        cy.contains("ul.menu > li", "Views").trigger("mouseover");
        cy.contains(
            "ul.menu li a.hyperlink_normal",
            "Inside Sales Input (FM)",
        ).click({ force: true });

        // Validation: Verify routing context points to correct Form List view ID
        cy.url({ timeout: 15000 }).should("include", "FormList.aspx");
        cy.url().should(
            "include",
            "ViewID=ac9ae0bc-87f8-4b93-993e-77b31b3a93f8",
        );

        // Workflow Step: Isolate specific record within the Tabular List using Funnel No criteria
        cy.intercept("POST", "**/FormList.aspx*").as("filterSearch");
        cy.get(
            '[name="ctl00$ContentPlaceHolder1$TabularList1$dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72$FilterDD_9"]',
        )
            .should("be.visible")
            .type(funnelNo)
            .type("{enter}");

        cy.wait("@filterSearch");

        // Validation: Assert at least one record matching the target exists for claiming
        cy.get(
            `[name="${SEL.tabularList}$ctl00_ContentPlaceHolder1_TabularList1_dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72_MainTable_0"]`,
            { timeout: 15000 },
        ).should("exist");

        // Workflow Step: Assign the target record (Claim action)
        cy.get(
            `[name="${SEL.tabularList}$ctl00_ContentPlaceHolder1_TabularList1_dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72_MainTable_0"]`,
        )
            .should("be.visible")
            .scrollIntoView();

        cy.get(
            `[name="${SEL.tabularList}$ctl00_ContentPlaceHolder1_TabularList1_dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72_MainTable_0"]`,
        ).check();

        cy.get(`[name="${SEL.tabularList}$${SEL.claimBtn}"]`, {
            timeout: 15000,
        })
            .should("be.visible")
            .click();

        // Workflow Step: Access the detailed view for the newly claimed record safely
        cy.get(
            '#ctl00_ContentPlaceHolder1_TabularList1_dgd835ceacf-0712-494c-8e7f-a6d0c9a5fa72_rw0 > [data-label="Action"] > a',
            { timeout: 15000 },
        )
            .should("be.visible")
            .invoke("attr", "href")
            .then((href) => {
                const url = href.startsWith("http")
                    ? href
                    : `${DWMS_BASE_URL}/${href.replace(/^\//, "")}`;

                cy.visit(url);
            });

        // Validation: Await detail form framework rendering
        cy.get(".card-title", { timeout: 15000 }).should("be.visible");

        // Workflow Step: Populate Optional/Required Fields Dynamically
        cy.get("body").then(($body) => {
            if ($body.find(`[name="${SEL.accountGroup}"]`).length > 0) {
                cy.get(`[name="${SEL.accountGroup}"]`)
                    .scrollIntoView()
                    .should("be.visible")
                    .select("1");
            } else {
                cy.log("Account Group field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            if ($body.find(`[name="${SEL.ctosDropdown}"]`).length > 0) {
                cy.get(`[name="${SEL.ctosDropdown}"]`)
                    .scrollIntoView()
                    .should("be.visible")
                    .select("Not-Checked");
            } else {
                cy.log("CTOS Status field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            const selector =
                '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_e4665dda-4566-434a-80f8-c42c0fb0024d$ddlGroup"]';
            if ($body.find(selector).length > 0) {
                cy.get(selector).then(($dropdown) => {
                    const selectedValue = $dropdown.val();
                    if (
                        !selectedValue ||
                        selectedValue === "" ||
                        selectedValue === "0"
                    ) {
                        cy.get(selector)
                            .scrollIntoView()
                            .should("be.visible")
                            .select("1");
                    } else {
                        cy.log(
                            `⚠ Customer Segment already has value: ${selectedValue} — skipping`,
                        );
                    }
                });
            } else {
                cy.log("⚠ Customer Segment field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            const selector =
                '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_c51f2ecf-f11e-4a66-abac-52d8b38c2d2e$ddlGroup"]';
            if ($body.find(selector).length > 0) {
                cy.get(selector).then(($dropdown) => {
                    const selectedValue = $dropdown.val();
                    if (
                        !selectedValue ||
                        selectedValue === "" ||
                        selectedValue === "0"
                    ) {
                        cy.get(selector)
                            .scrollIntoView()
                            .should("be.visible")
                            .select(0);
                    } else {
                        cy.log(
                            `⚠ Customer Segmentation already has value: ${selectedValue} — skipping`,
                        );
                    }
                });
            } else {
                cy.log("⚠ Customer Segmentation field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            if ($body.find(`[name="${SEL.soValueRadio}"]`).length > 0) {
                cy.get(`[name="${SEL.soValueRadio}"]`)
                    .eq(3)
                    .scrollIntoView()
                    .should("exist")
                    .check();
            } else {
                cy.log("⚠ SO Value field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            if ($body.find(`[name="${SEL.completeRadio}"]`).length > 0) {
                cy.intercept("POST", "**/FillForm.aspx*").as(
                    "completePostback",
                );

                cy.get(`[name="${SEL.completeRadio}"]`)
                    .eq(0)
                    .scrollIntoView()
                    .should("exist")
                    .check();

                cy.wait("@completePostback");

                cy.get(`[name="${SEL.rejectRadio}"]`, {
                    timeout: 10000,
                }).should("exist");
            } else {
                cy.log("⚠ Complete field not found — skipping");
            }
        });

        cy.get("body").then(($body) => {
            if ($body.find(`[name="${SEL.rejectRadio}"]`).length > 0) {
                cy.get(`[name="${SEL.rejectRadio}"]`)
                    .eq(1)
                    .scrollIntoView()
                    .should("exist")
                    .check();
            } else {
                cy.log("⚠ Reject field not found — skipping");
            }
        });

        // Workflow Step: Commit claim metadata updates to application backend
        cy.intercept("POST", "**/FillForm.aspx*").as("submitPostback");

        cy.get('[name="ctl00$ContentPlaceHolder1$btnSubmit"]')
            .last()
            .scrollIntoView()
            .should("be.visible")
            .click();

        cy.wait("@submitPostback");

        // Workflow Step: Parse Response for system-generated Submission No
        cy.wait(2000);

        cy.get("body").then(($body) => {
            let sourceText = "";

            const $label = $body.find(
                "#ctl00_ContentPlaceHolder1_FormEngine1_lblMessage",
            );
            if ($label.length > 0 && $label.text().trim() !== "") {
                sourceText = $label.text();
                cy.log(`lblMessage found: ${sourceText}`);
            } else {
                sourceText = $body.text();
                cy.log(
                    "lblMessage not found — scanning page body for Submission No",
                );
            }

            // Validation: Use contextual regex to isolate expected identifier string
            const match =
                /submission\s*(?:no|id|saved|created)?[:\s]+(?:is\s+)?(\w+)/i.exec(
                    sourceText,
                );

            if (match?.[1]) {
                const submissionNo = match[1];
                cy.log(`✓ Extracted Submission No: ${submissionNo}`);

                // Post-condition: Persist newly assigned Submission No tracking identifier
                cy.task("mergeFixture", { submissionNo });

                cy.writeFile("cypress/fixtures/cofr-submission.json", {
                    submissionNo,
                });
            } else {
                throw new Error(
                    `Could not extract Submission No from response.\n` +
                    `Page text snippet: "${sourceText.substring(0, 500)}"`,
                );
            }
        });
    });

    /**
     * Test Objective: Head of Department Review and Approval
     * Business Scenario: Head of Department verifies the claimed submission and grants approval to proceed.
     */
    it("Head of Dept Review - nizam.kadir", function () {
        // Preconditions: Idempotency Guard - Skip if HoD approval has already been completed.
        cy.skipIfCompleted("hodApproved");

        // Workflow Step: Verify precursor state and execute authentication
        cy.requireUpstreamData(["submissionNo"]).then((data) => {

            const submissionNo = data.submissionNo;

            cy.loginDWMS(
                Cypress.env("DWMS_HEAD_OF_DEPT_USERNAME"),
                Cypress.env("DWMS_HEAD_OF_DEPT_PASSWORD"),
            );

            openCOFR();

            // Workflow Step: Locate Submission entity via lookup retries
            findAndOpenSubmission(submissionNo);

            // Validation: Affirm display component renders
            cy.get(".card-title", { timeout: 15000 }).should("be.visible");

            // Workflow Step: Initiate Review Edit mode
            cy.get(
                ":nth-child(2) > .actionbar_normal > tbody > :nth-child(1) > td",
            )
                .should("be.visible")
                .click();

            // Workflow Step: Provide explicit comment payload and submit approval
            cy.get(
                '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_ebe23590-3d1a-471c-8cb7-b21ec9bb5133"]',
            )
                .should("be.visible")
                .type("Reviewed by HoD - looks good to me.", { delay: 0 });

            cy.intercept("POST", "**/fillform.aspx*").as(
                "approvalPostback",
            );

            cy.get('[name="ctl00$ContentPlaceHolder1$butt_custom_0"]')
                .should("be.visible")
                .click();

            cy.wait("@approvalPostback");

            // Post-condition: Mark HoD tier completion for downstream tracking
            cy.task("mergeFixture", { hodApproved: true });
            cy.log("✓ HoD approval completed and tracked in fixture");
        });
    });

    /**
     * Test Objective: Credit Management Verification
     * Business Scenario: CM evaluates credit status, assigns tracking options, and approves the request.
     */
    it("CM Credit Verification - juliuse", function () {
        // Preconditions: Idempotency Guard - Skip if CM Credit stage is completed.
        cy.skipIfCompleted("cmApproved");

        // Workflow Step: Verify precursor state and execute authentication
        cy.requireUpstreamData(["submissionNo"]).then((data) => {

            const submissionNo = data.submissionNo;

            cy.loginDWMS(
                Cypress.env("DWMS_CM_CREDIT_VERIFICATION_USERNAME"),
                Cypress.env("DWMS_CM_CREDIT_VERIFICATION_PASSWORD"),
            );

            openCOFR();

            // Workflow Step: Locate Submission entity via lookup retries
            findAndOpenSubmission(submissionNo);

            cy.get(".card-title", { timeout: 15000 }).should("be.visible");

            // Workflow Step: Initiate Credit Verification Evaluation
            cy.get(
                ":nth-child(2) > .actionbar_normal > tbody > :nth-child(1) > td",
            )
                .should("be.visible")
                .click();

            // Workflow Step: Flag entity explicitly as "Approve" and enforce cross-functional routing
            cy.get(
                '[name="ctl00$ContentPlaceHolder1$FormEngine1$mf_edc64f62-6d43-4bf7-a548-7226a80f8dae$ddlGroup"]',
            )
                .should("be.visible")
                .select("Approve");

            cy.get(".fieldcontrol_cell > :nth-child(1) > label")
                .should("be.visible")
                .click();

            cy.intercept("POST", "**/fillform.aspx*").as(
                "approvalPostback",
            );

            cy.get('[name="ctl00$ContentPlaceHolder1$butt_custom_0"]')
                .should("be.visible")
                .click();

            cy.wait("@approvalPostback");

            // Post-condition: Record success status to shared fixture cache
            cy.task("mergeFixture", { cmApproved: true });
            cy.log("✓ CM approval completed and tracked in fixture");
        });
    });

    /**
     * Test Objective: Final Verification and External Integration Trigger
     * Business Scenario: Originator confirms workflow completion and invokes ATOM cron job to signal downstream processes.
     */
    it("Submission verification - izwah", function () {
        // Preconditions: Idempotency Guard - Halt if complete workflow execution confirmed in previous runs.
        cy.skipIfCompleted("cofrCompleted");

        // Workflow Step: Authenticate as workflow Originator
        cy.requireUpstreamData(["submissionNo"]).then((data) => {

            const submissionNo = data.submissionNo;

            cy.loginDWMS(
                Cypress.env("DWMS_INSIDE_SALES_FM_USERNAME"),
                Cypress.env("DWMS_INSIDE_SALES_FM_PASSWORD"),
            );

            openCOFR();

            // Workflow Step: Review originator's historical submissions
            cy.get("#ctl00_ContentPlaceHolder1_hlMySubmissions")
                .should("be.visible")
                .click();

            cy.get(".container-fluid").should("be.visible");

            cy.intercept("POST", "**/mysubmissions.aspx*").as(
                "filterPostback",
            );

            // Validation: Expand visibility filter context to track transition mapping
            cy.get('[name="ctl00$ContentPlaceHolder1$ddlStatus"]')
                .should("be.visible")
                .select("All");

            cy.wait("@filterPostback");

            cy.contains(submissionNo, { timeout: 15000 }).should("exist");
            cy.log(`✓ Found Submission No: ${submissionNo}`);

            // Validation: Poll queue for COMPLETED status to confirm synchronous backend processing
            const maxRetries = 5;
            let retryCount = 0;

            const checkStage = () => {
                cy.contains("tr", submissionNo)
                    .should("be.visible")
                    .find('[data-label="Stage"]')
                    .invoke("text")
                    .then((stageText) => {
                        const stage = stageText.trim().toUpperCase();
                        cy.log(`Current Stage: ${stageText}`);

                        if (stage.includes("COMPLETED")) {
                            cy.log(`✓ Stage is COMPLETED`);
                        } else if (retryCount < maxRetries) {
                            retryCount++;
                            cy.log(
                                `⚠ Stage not COMPLETED yet - retrying (${retryCount}/${maxRetries})`,
                            );

                            cy.wait(2000);
                            cy.reload();
                            cy.get(".container-fluid").should("be.visible");

                            cy.intercept(
                                "POST",
                                "**/mysubmissions.aspx*",
                            ).as("retryFilterPostback");
                            cy.get(
                                '[name="ctl00$ContentPlaceHolder1$ddlStatus"]',
                            )
                                .should("be.visible")
                                .select("All");
                            cy.wait("@retryFilterPostback");

                            checkStage();
                        } else {
                            throw new Error(
                                `Submission ${submissionNo} not COMPLETED after ${maxRetries} retries.\n` +
                                `Current stage: ${stageText}`,
                            );
                        }
                    });
            };

            checkStage();

            // Workflow Step: Trigger CRON API for external integrations
            cy.then(() => {
                const cronUrl = `https://atom-stg2.time.com.my/atoms/public/api/dwms/dwmsapproved/sid/${submissionNo}/et/activation/format/xml`;
                cy.log(`Triggering cron job: ${cronUrl}`);

                cy.request({
                    method: "GET",
                    url: cronUrl,
                    failOnStatusCode: false,
                    timeout: 30000,
                }).then((response) => {
                    cy.log(`Cron job response: ${response.status}`);

                    // Validation: Guarantee success response reflecting ATOM payload ingestion
                    expect(response.status).to.eq(200);

                    // Post-condition: Flag entire COFR workflow execution as successfully finished
                    cy.task("mergeFixture", { cofrCompleted: true });
                    cy.log("✓ COFR workflow completed successfully and tracked in fixture");
                });
            });
        });
    });
});
