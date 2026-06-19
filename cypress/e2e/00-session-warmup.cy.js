/**
 * Test Objective: Global Session Initialization (Warmup)
 * Business Scenario: Pre-authenticates and caches user sessions across all integrated platforms (T2Q, ESO, CRM, DWMS/COFR).
 * This optimization eliminates redundant login overhead during the execution of subsequent end-to-end test specifications.
 * 
 * Pipeline Position: Initialization Step (Run First)
 * 
 * Preconditions: Valid test user credentials exist within the `quote-data.json` fixture and local `.env` configuration.
 * Post-conditions: 14 distinct authenticated sessions are persistently cached and ready for downstream test consumption.
 */

describe("Session Warmup - Pre-create all user sessions", function () {
    // NOTE: Exception handling is centralised in support/e2e.js

    let testData;

    before(function () {
        // Preconditions: Validate critical environment variables before starting
        const requiredEnvs = [
            "ESO_USERNAME", "ESO_PASSWORD",
            "CRM_USERNAME", "CRM_PASSWORD",
            "DWMS_INSIDE_SALES_ACTIVATION_USERNAME", "DWMS_INSIDE_SALES_ACTIVATION_PASSWORD",
            "DWMS_INSIDE_SALES_FM_USERNAME", "DWMS_INSIDE_SALES_FM_PASSWORD",
            "DWMS_HEAD_OF_DEPT_USERNAME", "DWMS_HEAD_OF_DEPT_PASSWORD",
            "DWMS_CM_CREDIT_VERIFICATION_USERNAME", "DWMS_CM_CREDIT_VERIFICATION_PASSWORD",
            "ATOM_USERNAME", "ATOM_PASSWORD"
        ];
        
        const missingEnvs = requiredEnvs.filter(key => !Cypress.env(key));
        if (missingEnvs.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvs.join(", ")}. Please check your cypress.env.json or CI/CD variables.`);
        }

        // Preconditions: Load static test data encompassing user credentials and roles
        cy.fixture("quote-data").then((data) => {
            testData = data;
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Time2Quote Sessions (8 users)
    // ═══════════════════════════════════════════════════════════════════
    /**
     * Test Objective: Time2Quote (T2Q) Session Caching
     * Business Scenario: Iteratively authenticates and caches sessions for the 8 distinct hierarchical roles involved in the quote approval workflow.
     */
    describe("Time2Quote (T2Q) - 8 users", function () {
        // Preconditions: Define hierarchical roles and associated credential keys
        const users = [
            { key: "clientManager", label: "Client Manager" },
            { key: "costingTeam", label: "Costing Team" },
            { key: "headOfHBU", label: "Head of HBU" },
            { key: "headOfPricing", label: "Head of Pricing" },
            { key: "pricingTeam", label: "Pricing Team" },
            { key: "headOfSales", label: "Head of Sales" },
            { key: "headOfCommercial", label: "Head of Commercial" },
            { key: "ceo", label: "CEO" },
        ];

        users.forEach(({ key, label }) => {
            it(`should create session for ${label}`, function () {
                // Workflow Step: Extract credentials contextually for the targeted role
                const { username, password } = testData.users[key];

                // Workflow Step: Authenticate and globally cache the session
                cy.login(username, password);

                // Validation: Acknowledge successful session caching via system logging
                cy.log(`✓ Session created: ${label} (${username})`);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // ESO Portal Session (1 user)
    // ═══════════════════════════════════════════════════════════════════
    /**
     * Test Objective: ESO Portal Session Caching
     * Business Scenario: Establishes a cached support session for downstream Service Order PDF generation.
     */
    describe("ESO Portal - 1 user", function () {
        it("should create session for CRMSUPPORT", function () {
            // Preconditions: Define environment constants for the ESO staging portal
            const ESO_BASE_URL = Cypress.env("ESO_BASE_URL");

            // Workflow Step: Authenticate and cache session for the CRMSUPPORT role
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

                // Validation: Ensure successful authentication routes correctly to the application dashboard
                cy.url({ timeout: 15000 }).should("include", "/home");
            });

            cy.log("✓ Session created: ESO CRMSUPPORT");
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // CRM Session (1 user)
    // ═══════════════════════════════════════════════════════════════════
    /**
     * Test Objective: CRM (vtiger) Session Caching
     * Business Scenario: Establishes a cached CRM session for downstream Sales Order creation and account verification.
     */
    describe("CRM (vtiger) - 1 user", function () {
        it("should create session for CRMSUPPORT", function () {
            // Preconditions: Define environment constants for the CRM staging portal
            const CRM_BASE_URL = Cypress.env("CRM_BASE_URL");

            // Workflow Step: Authenticate and cache session for the CRMSUPPORT role
            cy.session("CRMSUPPORT", () => {
                cy.visit(`${CRM_BASE_URL}/index.php`);

                cy.get('[name="user_name"]')
                    .should("be.visible")
                    .type(`{selectall}${Cypress.env("CRM_USERNAME")}`, {
                        log: false,
                    });

                cy.get('[name="user_password"]')
                    .should("be.visible")
                    .type(`{selectall}${Cypress.env("CRM_PASSWORD")}`, {
                        log: false,
                    });

                cy.get("#signin-button").should("be.visible").click();

                // Validation: Verify successful authentication redirect to the CRM contextual view
                cy.url({ timeout: 15000 }).should("include", "/crm/");
            });

            cy.log("✓ Session created: CRM CRMSUPPORT");
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // DWMS/COFR Sessions (4 users)
    // ═══════════════════════════════════════════════════════════════════
    /**
     * Test Objective: DWMS/COFR Session Caching
     * Business Scenario: Establishes cached sessions for the 4 distinct operational roles involved in the Centralized Order Fulfillment Request workflow.
     */
    describe("DWMS/COFR - 4 users", function () {
        // Preconditions: Define environment constants for the DWMS staging portal
        const DWMS_BASE_URL = Cypress.env("DWMS_BASE_URL");

        // Preconditions: Aggregate DWMS user credentials and labels from execution environment
        const dwmsUsers = [
            {
                username: Cypress.env("DWMS_INSIDE_SALES_ACTIVATION_USERNAME"),
                password: Cypress.env("DWMS_INSIDE_SALES_ACTIVATION_PASSWORD"),
                label: "Inside Sales Activation",
            },
            {
                username: Cypress.env("DWMS_INSIDE_SALES_FM_USERNAME"),
                password: Cypress.env("DWMS_INSIDE_SALES_FM_PASSWORD"),
                label: "Inside Sales (FM)",
            },
            {
                username: Cypress.env("DWMS_HEAD_OF_DEPT_USERNAME"),
                password: Cypress.env("DWMS_HEAD_OF_DEPT_PASSWORD"),
                label: "Head of Dept",
            },
            {
                username: Cypress.env("DWMS_CM_CREDIT_VERIFICATION_USERNAME"),
                password: Cypress.env("DWMS_CM_CREDIT_VERIFICATION_PASSWORD"),
                label: "CM Credit Verification",
            },
        ];

        dwmsUsers.forEach(({ username, password, label }) => {
            it(`should create session for ${label}`, function () {
                // Workflow Step: Iterate and comprehensively cache authenticated sessions for DWMS processing roles
                cy.session(["dwms", username], () => {
                    // Workflow Step: Define reusable authentication payload submission pattern
                    const fillAndSubmit = () => {
                        cy.get("#ctl00_ContentPlaceHolder1_txtUsername")
                            .should("be.visible")
                            .type(`{selectall}${username}`, {
                                delay: 0,
                                log: false,
                            });

                        cy.get("#ctl00_ContentPlaceHolder1_txtPassword")
                            .should("be.visible")
                            .type(`{selectall}${password}`, {
                                delay: 0,
                                log: false,
                            });

                        cy.get("#ctl00_ContentPlaceHolder1_btnLogin")
                            .should("be.visible")
                            .click();
                    };

                    // Workflow Step: Target DWMS login portal and execute initial payload
                    cy.visit(`${DWMS_BASE_URL}/login.aspx`);
                    fillAndSubmit();

                    // Validation: Mitigate intermittent ASP.NET session state anomalies (Silent Authentication Failure)
                    // Expected Result: Detect login page persistence and conditionally re-execute authentication payload if necessary.
                    cy.url({ timeout: 10000 }).then((url) => {
                        if (url.includes("login.aspx")) {
                            cy.visit(`${DWMS_BASE_URL}/login.aspx`);
                            fillAndSubmit();
                        }
                    });

                    // Validation: Verify application redirects correctly to the DWMS personal applications dashboard
                    cy.url({ timeout: 15000 }).should(
                        "include",
                        "/myapplications.aspx",
                    );
                });

                cy.log(`✓ Session created: DWMS ${label} (${username})`);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    after(function () {
        // Post-conditions: Output summary execution metrics for pipeline execution visibility
        cy.log("═══════════════════════════════════════════════════════");
        cy.log("✓ Session warmup complete");
        cy.log("  • Time2Quote: 8 sessions");
        cy.log("  • ESO Portal: 1 session");
        cy.log("  • CRM: 1 session");
        cy.log("  • DWMS/COFR: 4 sessions");
        cy.log("  Total: 14 sessions ready");
        cy.log("═══════════════════════════════════════════════════════");
    });
});
