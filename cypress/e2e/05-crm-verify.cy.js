/**
 * Test Objective: CRM Integration - Account Number & Probability Verification
 * Business Scenario: Validates that the downstream COFR workflow successfully synced the Account Number back to CRM and updated the Funnel Probability to 90%.
 * 
 * Workflow Steps:
 * 1. Authenticate to the CRM (vtiger) portal.
 * 2. Access the Potentials (Funnel) module.
 * 3. Search and locate the target Funnel utilizing Funnel No or Service Order No.
 * 4. Validate cross-system data integrity (Quote No, SO No, Funnel No).
 * 5. Verify the Funnel Probability successfully progressed to 90%.
 * 6. Extract and persist the provisioned Account Number.
 * 
 * Pipeline position: T2Q → ESO → CRM → COFR → CRM (check-acc)
 * Post-conditions: Persists `accountNo` to `cypress/fixtures/shared-quote-id.json` for consumption by downstream test specifications (ATOM).
 */

describe("Check for Account Number & Its Probability", () => {
    // Preconditions: Define environment constants and shared state variables
    const CRM_BASE_URL = Cypress.env("CRM_BASE_URL");

    // NOTE: Exception handling is centralised in support/e2e.js

    let quoteId;
    let serviceOrderNo;
    let funnelNo;
    let accountNo;

    // Preconditions: Load upstream test data from shared fixture
    before(function () {
        cy.requireUpstreamData(["quoteId", "serviceOrderNo"]).then((data) => {
            quoteId = data?.quoteId;
            serviceOrderNo = data?.serviceOrderNo;
            funnelNo = data?.funnelNo;

            if (!funnelNo) {
                cy.log(
                    "⚠ No funnelNo found — will search by serviceOrderNo to locate the funnel.",
                );
            }
        });
    });

    // Preconditions: Guard against test execution if prerequisites are missing at runtime
    beforeEach(function () {
        if (!quoteId || !serviceOrderNo) this.skip();
    });

    /**
     * Test Objective: Account Number & Probability Verification
     * Business Scenario: System searches for the active sales funnel, validates integration fields, and extracts the finalized Account Number.
     */
    it("should check for account number & its probability", function () {
        // Preconditions: Idempotency Guard - Skip if Account No is already captured in the shared fixture
        cy.skipIfCompleted("accountNo");

        // Workflow Step: Authenticate to CRM using cached session
        cy.loginCRM();

        // Workflow Step: Navigate to Potentials (Funnel) module directly
        cy.visit(
            `${CRM_BASE_URL}/index.php?module=Potentials&action=index&parenttab=Sales`,
        );

        // Workflow Step: Execute context-aware search strategy
        // If Funnel No is known, search directly; otherwise fallback to Service Order No lookup.
        if (funnelNo) {
            cy.get("#bas_searchfield")
                .should("be.visible")
                .select("potential_no");
            cy.get("#search_text")
                .should("be.visible")
                .type(`{selectall}${funnelNo}`);
            cy.log(`Searching by Funnel No: ${funnelNo}`);
        } else {
            cy.get("#bas_searchfield").should("be.visible").select("cf_698");
            cy.get("#search_text")
                .should("be.visible")
                .type(`{selectall}${serviceOrderNo}`);
            cy.log(`Searching by SO No: ${serviceOrderNo}`);
        }

        // Workflow Step: Trigger Search Execution
        cy.get('[name="submit"][value=" SEARCH NOW "]')
            .should("be.visible")
            .click();

        // Validation: Ensure search results populate successfully
        cy.get("table.lvt", { timeout: 10000 }).should("be.visible");
        cy.get("table.lvt tbody tr").should("have.length.at.least", 2);

        // Workflow Step: Isolate target record and navigate to Detail View
        const linkSelector = funnelNo || /^POT\d+/;

        cy.get("table.lvt tbody tr")
            .eq(1)
            .find("a")
            .contains(linkSelector)
            .should("be.visible")
            .then(($a) => {
                funnelNo = $a.text().trim();
                cy.log(`Captured Funnel No: ${funnelNo}`);
                cy.wrap($a).click();
            })

        // Validation: Verify URL navigation and Module context
        cy.url({ timeout: 15000 })
            .should("include", "DetailView")
            .and("include", "module=Potentials");

        // Validation: Await detail form framework rendering
        cy.get(String.raw`#tblFunnelInformation\:`).should("be.visible");

        // Validation: Assert Cross-System Integration Consistency (Funnel No, SO No, Quote No)
        cy.get(
            String.raw`#tblFunnelInformation\: > table.small > tbody > :nth-child(1) > :nth-child(2)`,
        )
            .should("be.visible")
            .and("contain.text", funnelNo);

        cy.get(String.raw`#mouseArea_SO\ No`)
            .should("be.visible")
            .and("contain.text", serviceOrderNo);

        cy.get(String.raw`#mouseArea_Quote\ No`)
            .should("be.visible")
            .and("contain.text", quoteId);

        // Validation: Verify Funnel Probability progressed to 90%
        // Expected Result: CRM accurately reflects activation stage logic from DWMS sync.
        cy.get('[id="mouseArea_Probability (%)"]')
            .should("be.visible")
            .and("contain.text", "90");

        // Workflow Step: Extract Provisioned Account Number from Detail View
        cy.get(String.raw`#mouseArea_Account\ No`)
            .should("be.visible")
            .invoke("text")
            .then((text) => {
                const regex = /\d+/;
                const match = regex.exec(text);
                accountNo = match ? match[0] : text.trim();
                cy.log(`Captured Account No: ${accountNo}`);

                // Validation: Ensure extracted Account Number meets expected format criteria
                expect(accountNo).to.not.be.empty;
                expect(accountNo).to.match(/^\d+$/);

                // Post-condition: Persist Funnel No and Account No atomically to shared fixture
                cy.task("mergeFixture", { funnelNo, accountNo });
                cy.log("Saved funnelNo and accountNo to shared-quote-id.json");
            });
    });
});
