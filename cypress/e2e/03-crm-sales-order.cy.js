/**
 * Test Objective: CRM Integration - Sales Order Creation
 * Business Scenario: Validates the CRM workflow by updating a Sales Order Funnel utilizing upstream quote and service order data.
 * 
 * 1. Authenticate to the CRM (vtiger) portal.
 * 2. Access the Potentials (Funnel) module.
 * 3. Search and locate the Funnel generated from the upstream quote.
 * 4. Capture the generated Funnel No (POTxxxxx) for downstream order fulfillment.
 * 5. Verify the CRM Funnel probability automatically synced to 75%.
 * 6. Update Funnel details to bind the Revenue Cost Center and Service Order No.
 * 7. Save modifications and persist the Funnel No.
 * 
 * Post-conditions: Persists `funnelNo` and `email` to `cypress/fixtures/shared-quote-id.json` for consumption by downstream test specifications (COFR).
 */

describe("CRM - Sales Order Creation", () => {
    // Preconditions: Define environment constants and shared state variables
    const CRM_BASE_URL = Cypress.env("CRM_BASE_URL");

    // NOTE: Exception handling is centralised in support/e2e.js

    let quoteId;
    let serviceOrderNo;
    let funnelNo;

    // Preconditions: Load upstream test data from shared fixture
    before(function () {
        cy.requireUpstreamData(["quoteId", "serviceOrderNo"]).then((data) => {
            quoteId = data.quoteId;
            serviceOrderNo = data.serviceOrderNo;
        });
    });

    // Preconditions: Guard against test execution if prerequisites are missing at runtime
    beforeEach(function () {
        if (!quoteId || !serviceOrderNo) this.skip();
    });

    /**
     * Test Objective: Create Sales Order from Approved Quote
     * Business Scenario: System locates the auto-generated funnel, verifies data sync, and links the provisioning Service Order.
     */
    it("should create a sales order from the approved quote", function () {
        // Preconditions: Idempotency Guard - Skip if Funnel No is already captured in the shared fixture
        cy.skipIfCompleted("funnelNo");

        // Workflow Step: Pre-determine target email for notifications to ensure availability for fixture merge
        const targetEmails = [
            "syafiq.hadzir@time.com.my",
            "siti.rufaidah@time.com.my",
        ];
        const randomEmail = targetEmails[Math.floor(Math.random() * targetEmails.length)];

        // Workflow Step: Authenticate to CRM using cached session
        cy.loginCRM();

        // Workflow Step: Navigate to Potentials (Funnel) module directly
        cy.visit(
            `${CRM_BASE_URL}/index.php?module=Potentials&action=index&parenttab=Sales`,
        );

        // Workflow Step: Search for Funnel using upstream Quote ID
        cy.get("#bas_searchfield").should("be.visible").select("quote_no");
        cy.get("#search_text").should("be.visible").clear().type(quoteId);
        cy.get('[name="submit"][value=" SEARCH NOW "]')
            .should("be.visible")
            .click();

        // Validation: Ensure search results populate and contain the expected Quote ID
        cy.get("table.lvt", { timeout: 10000 }).should("be.visible");
        cy.get("table.lvt")
            .contains("td", quoteId, { timeout: 10000 })
            .should("be.visible");

        // Workflow Step: Capture the System-Generated Funnel No (POTxxxxx)
        cy.contains("table.lvt tr", quoteId).within(() => {
            cy.get("a")
                .contains(/^POT\d+/)
                .invoke("text")
                .then((text) => {
                    funnelNo = text.trim();
                    cy.log(`Captured Funnel No: ${funnelNo}`);

                    // Post-condition: Persist Funnel No and assigned email atomically to shared fixture
                    cy.task("mergeFixture", { funnelNo, email: randomEmail });
                    cy.log(
                        `Funnel No: ${funnelNo} and Email: ${randomEmail} written to shared-quote-id.json`,
                    );
                });
        });

        // Workflow Step: Open Funnel Detail View
        cy.contains("table.lvt tr", quoteId).within(() => {
            cy.get("a")
                .contains(/^POT\d+/)
                .click();
        });

        // Validation: Verify URL navigation and Module context
        cy.url({ timeout: 15000 }).should("include", "DetailView");
        cy.url().should("include", "module=Potentials");

        // Validation: Verify Funnel Probability synced automatically to 75%
        // Expected Result: CRM updates quote probability rules mapped from upstream processing.
        cy.get('[id="mouseArea_Probability (%)"]')
            .should("be.visible")
            .and("contain.text", "75");

        // Workflow Step: Initiate Edit Mode to update commercial and provisioning details
        cy.get('input[name="Edit"]').first().should("be.visible").click();

        // Workflow Step: Define Revenue Cost Center (Bank)
        cy.get("#occ").should("be.visible").clear().type("Bank");

        // Workflow Step: Bind downstream Service Order Number to the CRM Funnel
        cy.get("#salesorderno")
            .should("be.visible")
            .clear()
            .type(serviceOrderNo);
        cy.log(`Service Order No: ${serviceOrderNo}`);

        // Workflow Step: Assign target email for notifications
        cy.get('[name="email"]').should("be.visible").clear().type(randomEmail);
        cy.log(`Inserted Random Email: ${randomEmail}`);

        // Workflow Step: Validate and populate Site A Address fallback
        cy.get('[name="customer_location_site_a"]')
            .should("be.visible")
            .then(($el) => {
                const currentValue = $el.val() || $el.text();

                if (!currentValue || currentValue.trim() === "") {
                    cy.wrap($el)
                        .clear()
                        .type(
                            "No. 14, Jalan Majistret U1/26, HICOM Glenmarie Industrial Park, 40150 Shah Alam, Selangor, Malaysia",
                        );
                    cy.log("Site A address filled");
                } else {
                    cy.log(`Site A already filled: ${currentValue}`);
                }
            });

        // Workflow Step: Validate and populate Entity Registered Country fallback
        cy.get('[name="entity_registered_country"]')
            .should("be.visible")
            .then(($select) => {
                const currentValue = $select.val();

                if (!currentValue || currentValue.trim() === "" || currentValue === "0") {
                    cy.wrap($select).select("Hong Kong");
                    cy.log("Entity Registered Country set to: Hong Kong");
                } else {
                    cy.log(`Entity Registered Country already set: ${currentValue}`);
                }
            });

        // Workflow Step: Set validity period to 2 years from today
        const validityDate = new Date();
        validityDate.setFullYear(validityDate.getFullYear() + 2);
        const validityFormatted = `${String(validityDate.getDate()).padStart(2, "0")}-${String(validityDate.getMonth() + 1).padStart(2, "0")}-${validityDate.getFullYear()}`;
        cy.get('[name="validity_period"]')
            .should("be.visible")
            .clear()
            .type(validityFormatted);
        cy.log(`Validity Period set to: ${validityFormatted}`);

        // Workflow Step: Suppress validation alerts and save modifications
        cy.window().then((win) => {
            cy.stub(win, "alert").as("alertStub");
        });

        cy.get("input.crmbutton.save").first().should("be.visible").click();

        // Validation: Verify successful save redirect to Detail View
        cy.wait(2000);
        cy.url({ timeout: 15000 }).should("include", "DetailView");

        cy.log(`Successfully saved funnel for quote ${quoteId}`);
    });
});
