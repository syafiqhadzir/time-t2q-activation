/**
 * Test Objective: ESO (eSO Portal) - Auto Service Order Form Generation
 * Business Scenario: Automates the generation and extraction of a Service Order (SO) Number via the ESO Portal's PDF generation API, using a quote created in upstream processes.
 * 
 * 1. Authenticate to the ESO Portal.
 * 2. Access the main dashboard.
 * 3. Trigger Auto Service Order Form Generation via API.
 * 4. Parse the returned PDF or headers to extract the Service Order Number.
 * 5. Persist the extracted SO Number for downstream systems (CRM).
 * 
 * Post-conditions: Persists `serviceOrderNo` to `cypress/fixtures/shared-quote-id.json` for consumption by downstream test specifications (CRM).
 */

describe("ESO - Auto Service Order Form Generation", () => {
    // Preconditions: Define environment constants and shared state variables
    const ESO_BASE_URL = Cypress.env("ESO_BASE_URL");

    let sharedQuoteData;

    // Preconditions: Load upstream test data from shared fixture
    before(function () {
        cy.requireUpstreamData(["quoteId"]).then((data) => {
            sharedQuoteData = data;
        });
    });

    // Preconditions: Guard against test execution if prerequisite `quoteId` is missing
    beforeEach(function () {
        if (!sharedQuoteData?.quoteId) this.skip();
    });

    /**
     * Test Objective: Generate and Extract Service Order PDF
     * Business Scenario: System authenticates and triggers SO generation, retrieving the SO Number for provisioning.
     */
    it("should login, load dashboard, and generate Service Order PDF", function () {
        // Preconditions: Idempotency Guard - Skip if Service Order No is already captured in the shared fixture
        cy.skipIfCompleted("serviceOrderNo");

        // Workflow Step: Authenticate to ESO using cached session
        cy.session("ESO_CRMSUPPORT", () => {
            cy.visit(`${ESO_BASE_URL}/`);
            cy.get("#login_form").should("be.visible");
            cy.get("#user-name")
                .should("be.visible")
                .type(`{selectall}${Cypress.env("ESO_USERNAME")}`, {
                    log: false,
                });
            cy.get("#user-password")
                .should("be.visible")
                .type(`{selectall}${Cypress.env("ESO_PASSWORD")}`, {
                    log: false,
                });
            cy.get('#login_form button[type="submit"]')
                .should("be.visible")
                .click();
            
            // Validation: Confirm successful authentication redirect
            cy.url({ timeout: 15000 }).should("include", "/home");
        });

        // Workflow Step: Navigate to ESO dashboard and verify load completion
        cy.visit(`${ESO_BASE_URL}/home`);
        cy.get("#page-body").should("exist");
        cy.get(".rounded.hover-box").first().should("be.visible");

        // Workflow Step: Trigger API for Auto Service Order Form Generation
        cy.request({
            method: "GET",
            url: `${ESO_BASE_URL}/main/generateAutoServiceOrderForm/${sharedQuoteData.quoteId}`,
            encoding: "binary",
            retryOnStatusCodeFailure: true,
        }).then((response) => {
            // Validation: Ensure HTTP request succeeds
            expect(response.status).to.eq(200);

            // Validation: Detect and handle API configuration errors disguised as HTTP 200 HTML responses
            const contentType = (
                response.headers["content-type"] || ""
            ).toLowerCase();

            const bodyPreview =
                typeof response.body === "string"
                    ? response.body.substring(0, 500)
                    : "";

            if (
                contentType.includes("text/html") ||
                bodyPreview.includes("<script>")
            ) {
                const alertRegex = /alert\("([^"]+)"\)/;
                const alertMatch = alertRegex.exec(bodyPreview);

                const errorMsg = alertMatch
                    ? alertMatch[1]
                    : `Unexpected HTML response: ${bodyPreview.substring(0, 200)}`;

                throw new Error(
                    `ESO did not return a PDF for quote ${sharedQuoteData.quoteId}.\n` +
                        `Server message: "${errorMsg}"\n` +
                        `Fix: ensure the quote has a valid division assigned in ESO before generating the SO form.`,
                );
            }

            // Workflow Step: Extract Service Order No from HTTP headers or PDF body
            const contentDisposition =
                response.headers["content-disposition"] || "";
            cy.log("Content-Disposition:", contentDisposition);

            // Validation: Attempt extraction via Enterprise filename pattern (`BCA{id}-tdc.pdf`)
            const filenameMatch = contentDisposition.match(
                /filename="?([A-Z]{3}\d+)-tdc\.pdf"?/,
            );

            if (filenameMatch) {
                const serviceOrderNo = filenameMatch[1];
                cy.log(`Service Order No (from filename): ${serviceOrderNo}`);

                sharedQuoteData.serviceOrderNo = serviceOrderNo;

                // Post-condition: Persist Service Order No atomically to shared fixture
                cy.task("mergeFixture", {
                    serviceOrderNo: sharedQuoteData.serviceOrderNo,
                });

                return;
            }

            // Validation: Fallback extraction for Wholesale PDFs via binary stream parsing
            cy.task("parsePdf", response.body).then((pdfText) => {
                cy.log("PDF text extracted, length:", pdfText.length);

                const bodyMatch = pdfText.match(/BCA\d+/);

                // Expected Result: SO Number pattern must exist within the PDF text content
                expect(bodyMatch, "BCA pattern should exist in PDF text").to.not
                    .be.null;

                const serviceOrderNo = bodyMatch[0];
                cy.log(`Service Order No (from PDF body): ${serviceOrderNo}`);

                sharedQuoteData.serviceOrderNo = serviceOrderNo;

                // Post-condition: Persist Service Order No atomically for downstream test specifications
                cy.task("mergeFixture", {
                    serviceOrderNo: sharedQuoteData.serviceOrderNo,
                });
                cy.log("Saved serviceOrderNo to shared-quote-id.json");
            });
        });
    });
});
