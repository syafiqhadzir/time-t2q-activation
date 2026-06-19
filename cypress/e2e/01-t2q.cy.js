/**
 * Test Objective: Time2Quote (T2Q) - Complete Quote Lifecycle
 * Business Scenario: Validates the end-to-end quote workflow encompassing creation, multi-level approval, and CRM funnel generation.
 * 
 * 1. Quote creation by Client Manager.
 * 2. Multi-level approval workflow (Data-driven):
 *    Costing Team → Head of HBU → Head of Pricing (Assign) → Pricing Team → Head of Sales → Head of Pricing (Final) → Head of Commercial → CEO.
 * 3. Funnel generation from the fully approved quote.
 * 
 * Post-conditions: Persists `quoteId` to `cypress/fixtures/shared-quote-id.json` for consumption by downstream test specifications (ESO and CRM).
 */

describe("Time2Quote - Complete Quote Lifecycle", function () {
    // Preconditions: Define suite-level state variables for test data and shared Quote ID
    let testData;
    let quoteId;

    // Preconditions: Load test data containing user credentials, customer information, and product configurations
    before(function () {
        cy.fixture("quote-data").then((data) => {
            testData = data;
        });

        // Preconditions: Hydrate shared Quote ID if it already exists to prevent `beforeEach` from skipping downstream tests on re-runs
        cy.task("readFixture").then(function (data) {
            if (data?.quoteId) {
                quoteId = data.quoteId;
            }
        });
    });

    // Preconditions: Guard against test execution if prerequisite `quoteId` has not been generated
    beforeEach(function () {
        const isCreationTest = Cypress.currentTest.titlePath
            .join(" ")
            .includes("Quote Creation");

        if (!quoteId && !isCreationTest) {
            this.skip();
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // 1. Quote Creation
    // ─────────────────────────────────────────────────────────────────
    /**
     * Test Objective: Quote Creation - Internet Product
     * Business Scenario: Client Manager generates a new quote for an Internet product associated with a new customer.
     */
    describe("Quote Creation - Internet Product", () => {
        it("should create a quote with Internet product for a new customer", function () {
            // Preconditions: Idempotency Guard
            // Expected Result: Skips quote creation if a valid `quoteId` is already present in the shared fixture.
            cy.skipIfCompleted("quoteId");

            // Workflow Step: Intercept key XHR routes for observability and synchronization.
            cy.intercept("GET", "**/index.php/main/ajax/waitingQuoteList*").as("waitingQuoteList");
            cy.intercept("GET", "**/index.php/main/ajax/completeQuoteList*").as("completeQuoteList");
            cy.intercept("GET", "**/index.php/quote/ajax/customerInfo*").as("customerInfo");
            cy.intercept("GET", "**/index.php/quote/ajax/customerList*").as("customerList");
            cy.intercept("GET", "**/index.php/quote/ajax/productInfo*").as("productInfo");
            cy.intercept("GET", "**/index.php/quote/ajax/productType*").as("productType");
            cy.intercept("GET", "**/index.php/quote/getStandardProductConfig*").as("standardProductConfig");
            cy.intercept("GET", "**/index.php/quote/quoteproduct/*").as("quoteProduct");
            cy.intercept("GET", "**/index.php/quote/ajax/productLine*").as("productLine");
            cy.intercept("GET", "**/index.php/quote/ajax/autoSelection*").as("autoSelection");
            cy.intercept("POST", "**/index.php/quote/ajax/warningError*").as("warningError");
            cy.intercept("GET", "**/index.php/quote/ajax/productVas*").as("productVas");
            cy.intercept("GET", "**/index.php/quote/ajax/productResiliency*").as("productResiliency");
            cy.intercept("GET", "**/index.php/quote/ajax/siteList*").as("siteList");
            cy.intercept("GET", "**/index.php/quote/ajax/siteInfo*").as("siteInfo");

            // Workflow Step: Authenticate as Client Manager using cached session
            cy.login(
                testData.users.clientManager.username,
                testData.users.clientManager.password,
            );

            // Workflow Step: Navigate to the New Quote creation form
            cy.get('[width="100%"] > :nth-child(1) > :nth-child(1) > td > .btn')
                .should("be.visible")
                .click();

            // Workflow Step: Initiate Customer Search
            cy.get('#btnSearchCustomer').should("be.visible").click();
            cy.wait('@customerList');

            // Workflow Step: Randomly select Page 1 or Page 2 for customer selection
            const usePage2 = Math.random() < 0.5;
            const selectedPage = usePage2 ? 2 : 1;
            cy.log(`🎲 Randomly selected page ${selectedPage} for customer selection`);

            if (usePage2) {
                cy.get(':nth-child(8) > a').should("be.visible").click();
                cy.wait(1000);
            }

            // Workflow Step: Select a random, valid customer profile
            // Note: index 2 is excluded only on Page 2 due to known data issue there.
            const validIndices = selectedPage === 2
                ? [1, 3, 4, 5, 6, 7, 8, 9, 10, 11]
                : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
            const randomCustomerIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
            cy.log(`🎲 Randomly selected customer index from page ${selectedPage}: ${randomCustomerIndex}`);

            // Workflow Step: Capture Account ID and Company Name for fixture persistence
            cy.get(`#divCustomerList > .table > tbody > :nth-child(${randomCustomerIndex}) > :nth-child(1)`)
                .invoke('text')
                .then((accountId) => {
                    const cleanAccountId = accountId.trim();
                    cy.log(`Captured Account ID: ${cleanAccountId}`);

                    cy.get(`#divCustomerList > .table > tbody > :nth-child(${randomCustomerIndex}) > :nth-child(2)`)
                        .invoke('text')
                        .then((companyName) => {
                            const cleanCompanyName = companyName.trim();
                            cy.log(`Captured Company Name: ${cleanCompanyName}`);

                            cy.task("mergeFixture", {
                                accountId: cleanAccountId,
                                companyName: cleanCompanyName,
                                customerIndex: randomCustomerIndex
                            });
                        });
                });

            // Workflow Step: Confirm customer selection
            cy.get(`:nth-child(${randomCustomerIndex}) > :nth-child(5) > [name="customer"]`)
                .should("be.visible")
                .click();
            cy.get("#myModal > .modal-body").should("be.visible");

            // Workflow Step: Define Customer Status and proceed
            cy.get('[name="customerStatus"]')
                .should("be.visible")
                .select(testData.customer.status);
            cy.get(":nth-child(2) > tbody > :nth-child(2) > td > .btn")
                .should("be.visible")
                .click();

            // Workflow Step: Populate Basic Quote Details (Billing, Contract Term, Sales Type)
            cy.get(
                ".span9 > :nth-child(2) > :nth-child(1) > :nth-child(1) > :nth-child(1)",
            ).should("be.visible");
            cy.fillQuoteBasicDetails(testData.quoteBasicDetails);

            // Workflow Step: Select Quote Solution Architecture
            cy.selectSolution(testData.solution);

            // Workflow Step: Append Internet Product to the Quote
            cy.get(
                ":nth-child(4) > :nth-child(1) > table > tbody > tr > :nth-child(4)",
            )
                .should("be.visible")
                .click();
            cy.get("#productselection > .panel > .panel-body").should(
                "be.visible",
            );
            cy.get(':nth-child(2) > [valign="bottom"]').should("be.visible");
            cy.get(':nth-child(3) > [valign="middle"] > [name="producttype"]')
                .should("be.visible")
                .click();
            cy.get("#btnAddProduct").should("be.visible").click();

            // Workflow Step: Configure Internet Line Parameters (Bandwidth, Access Type, SLA)
            cy.get(
                "#divAddNewLineBtn > :nth-child(1) > :nth-child(1) > :nth-child(1) > :nth-child(1)",
            ).should("be.visible");
            cy.get("#divLineBtn > .btn").should("be.visible").click();
            cy.get('[name="bandwidth"]').should("be.visible");
            cy.configureInternetLine(testData.products.internet);

            // Workflow Step: Define Commercial Pricing Structure (ARC, OTC, VAS)
            cy.get("#pricePlanId1").click();
            cy.get('[name="targetPrice"]')
                .clear()
                .type(testData.pricing.targetPriceARC);
            cy.get('[name="targetPriceOtcLine"]')
                .clear()
                .type(testData.pricing.oneTimeCharge);
            cy.get('[name="bundledSecurityVas"]').select(
                testData.pricing.bundledSecurityVas,
            );

            // Workflow Step: Configure Physical Site Location (Site A)
            cy.get(".icon-search").click();
            cy.get("#collapseSiteASearch > table > tbody > tr > td").should(
                "be.visible",
            );
            cy.get('[name="siteAKey"]').clear().type(testData.site.siteAKey);
            cy.get("#btnSiteASearch").click();
            cy.get("#divSiteAList").should("be.visible");
            cy.get('[name="site"]').should("be.visible").click();

            // Workflow Step: Submit Line Details and Finalize Quote Configuration
            cy.get("#btnAddLineRecord").click();
            cy.get("#divAddNewLineBtn > :nth-child(5) > tbody > tr > td > .btn")
                .should("be.visible")
                .click();
            cy.get("#btnFinalize").should("be.visible").click();

            // Workflow Step: Capture System-Generated Quote ID
            cy.captureQuoteId(
                ":nth-child(1) > :nth-child(1) > :nth-child(1) > :nth-child(2) > :nth-child(1) > :nth-child(1) > tbody > :nth-child(1) > :nth-child(4)",
            ).then((id) => {
                quoteId = id;
                cy.log(`Quote ID: ${quoteId}`);

                // Post-condition: Persist Quote ID atomically to the shared data fixture
                cy.task("mergeFixture", { quoteId });
            });

            // Workflow Step: Submit Quote to Multi-Level Approval Chain
            // Validation: Verifies the system successfully queues the quote and transitions to the index view.
            cy.get('[onclick*="approvalValidation"]', { timeout: 60000 })
                .should("be.visible")
                .click();
            cy.get('.table', { timeout: 60000 }).should("be.visible");
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 2. Multi-Level Approval Workflow (data-driven)
    // ─────────────────────────────────────────────────────────────────
    /**
     * Test Objective: Approval Workflow - Multi-Level Quote Approval Process
     * Business Scenario: Data-driven execution iterating sequentially through the established 8-tier hierarchy.
     */
    describe("Approval Workflow - Multi-Level Quote Approval Process", () => {
        /**
         * Preconditions: Define the Sequential Approval Chain Schema
         * Dictates the actor, expected action, test runner label, and verification targets for each specific tier.
         */
        const approvalSteps = [
            {
                user: "costingTeam",
                action: "approve",
                level: 1,
                label: "Costing Team Approval",
            },
            {
                user: "headOfHBU",
                action: "approve",
                level: 2,
                label: "Head of HBU Approval",
            },
            {
                user: "headOfPricing",
                action: "assign",
                level: 3,
                label: "Head of Pricing Assignment",
            },
            {
                user: "pricingTeam",
                action: "approve",
                level: 4,
                label: "Pricing Team Approval",
            },
            {
                user: "headOfSales",
                action: "approve",
                level: 5,
                label: "Head of Sales Approval",
            },
            {
                user: "headOfPricing",
                action: "approve",
                level: 6,
                label: "Head of Pricing Final Approval",
            },
            {
                user: "headOfCommercial",
                action: "approve",
                level: 7,
                label: "Head of Commercial Approval",
            },
            {
                user: "ceo",
                action: "approve",
                level: 8,
                label: "CEO Final Approval",
                verifyTab: "completed",
            },
        ];

        // Execution: Iterate execution dynamically for each defined workflow step to isolate failures.
        approvalSteps.forEach(
            ({ user, action, level, label, verifyTab = "other" }) => {
                it(`Level ${level}: ${label}`, function () {
                    // Preconditions: Idempotency Guard - Skips previously completed approval tiers.
                cy.skipIfCompleted(`approvalLevel${level}`);

                    // Workflow Step: Acquire Authenticated Session for the designated approval actor
                    const { username, password } = testData.users[user];
                    cy.login(username, password);

                    // Workflow Step: Locate Quote entity and initiate interaction mode
                    cy.searchQuoteById(quoteId);
                    cy.openQuoteForEdit();

                    // Workflow Step: Execute specific tier action (Approve or Delegate to Assignment)
                    if (action === "assign") {
                        cy.assignQuoteToPricing(
                            testData.users.pricingTeam.assigneeCode,
                        );
                    } else {
                        cy.approveQuote();
                    }

                    // Validation: Assert the Quote entity properly transitions to the expected state queue
                    // Expected Result: Final step moves to "Completed", others refresh within their active tab.
                    if (verifyTab === "completed") {
                        cy.switchToTab("completed");
                        cy.searchQuoteById(quoteId, "completed");
                    } else {
                        cy.refreshQuoteList();
                        cy.searchQuoteById(quoteId, "other");
                    }

                    // Post-condition: Flag current tier as functionally complete in the shared fixture.
                    cy.task("mergeFixture", { [`approvalLevel${level}`]: true });
                    cy.log(`✓ Approval Level ${level} (${label}) completed and tracked in fixture`);
                });
            },
        );
    });

    // ─────────────────────────────────────────────────────────────────
    // 3. Funnel Generation
    // ─────────────────────────────────────────────────────────────────
    /**
     * Test Objective: Funnel Generation
     * Business Scenario: Client Manager triggers CRM system funnel integration from a finalized quote.
     */
    describe("Funnel Generation", () => {
        it("should generate a funnel from the approved quote", function () {
            // Preconditions: Idempotency Guard - Skips if downstream integration funnel was already created.
            cy.skipIfCompleted("funnelGenerated");

            // Workflow Step: Authenticate as Client Manager
            cy.login(
                testData.users.clientManager.username,
                testData.users.clientManager.password,
            );

            // Workflow Step: Access Finalized Quotes Portfolio
            cy.switchToTab("completed");
            cy.searchQuoteById(quoteId, "completed");

            // Workflow Step: Execute External Integration (Funnel Creation API hook)
            // Validation: System correctly binds request and signals funnel creation downstream.
            cy.get(`[onclick*="addfunnel/${quoteId}"]`)
                .should("be.visible")
                .click();

            // Post-condition: Record Integration success to unblock downstream tests.
            cy.task("mergeFixture", { funnelGenerated: true });
            cy.log("✓ Funnel generation completed and tracked in fixture");
        });
    });
});
