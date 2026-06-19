// ***********************************************
// Custom commands for Time2Quote application
// ***********************************************

// Import cypress-file-upload plugin for file attachment support
import "cypress-file-upload";

/**
 * Idempotency Guard: Skips the current test/suite if a specific workflow step is already marked complete in the shared fixture.
 * @param {string} completionKey - The key in the fixture representing completion (e.g., 'atomCompleted')
 */
Cypress.Commands.add("skipIfCompleted", (completionKey) => {
    return cy.task("readFixture").then(function (data) {
        if (data && data[completionKey]) {
            cy.log(`⚠ Idempotency Guard: '${completionKey}' is already complete. Skipping.`);
            this.skip();
            return;
        }
        return data;
    });
});

/**
 * Upstream Data Guard: Checks the shared fixture for required keys. Skips gracefully if any are missing.
 * @param {string[]} requiredKeys - Array of required data keys (e.g., ['quoteId', 'serviceOrderNo'])
 */
Cypress.Commands.add("requireUpstreamData", (requiredKeys = []) => {
    return cy.task("readFixture").then(function (data) {
        const missing = requiredKeys.filter((k) => !data || data[k] === undefined);
        if (missing.length > 0) {
            cy.log(`⚠ Missing upstream data: [${missing.join(", ")}]. Skipping.`);
            this.skip();
            return;
        }
        return data;
    });
});

/**
 * Login to Time2Quote via session caching.
 * Sessions are cached per username — eliminates redundant logins for
 * users that authenticate more than once (e.g. Head of Pricing).
 *
 * After login, the app redirects to /index.php/main/view (dashboard).
 * @param {string} username
 * @param {string} password
 */
Cypress.Commands.add("login", (username, password) => {
    cy.session(username, () => {
        cy.visit("/index.php");
        // Use {selectall} instead of clear() — clear() can trigger postbacks
        // that reload the page before the password is entered.
        const usernameStr =
            typeof username === "string" ? username : JSON.stringify(username);
        const passwordStr =
            typeof password === "string" ? password : JSON.stringify(password);
        cy.get('[name="username"]')
            .should("be.visible")
            .type("{selectall}" + usernameStr, { log: false });
        cy.get('[name="password"]')
            .should("be.visible")
            .type("{selectall}" + passwordStr, { log: false });
        cy.get("#btn-submit").click();
        cy.get('[width="100%"]', { timeout: 15000 }).should("be.visible");
    });
    // After session restore the page is blank — navigate to the dashboard
    cy.visit("/index.php/main/view");
    cy.get('[width="100%"]', { timeout: 15000 }).should("be.visible");
});

/**
 * Search and select a customer in Time2Quote.
 * @param {number} customerIndex - Row index of the customer to select (default: 2)
 */
Cypress.Commands.add("selectCustomer", (customerIndex = 2) => {
    const index = Number(customerIndex);
    cy.get("#btnSearchCustomer").should("be.visible").click();
    cy.get(`:nth-child(${index}) > :nth-child(5) > [name="customer"]`)
        .should("be.visible")
        .click();
});

/**
 * Fill in quote basic details.
 * @param {object} quoteData - Quote configuration data
 */
Cypress.Commands.add("fillQuoteBasicDetails", (quoteData) => {
    cy.get('[name="currency"]').select(quoteData.currency);
    cy.get('[name="billingEntity"]').select(quoteData.billingEntity);
    cy.get('[name="contractPeriod"]').clear().type(quoteData.contractPeriod);
    cy.get('[name="salesTypeId"]').select(quoteData.salesType);
    cy.get('[name="contractTerms"]').click();

    if (quoteData.endOfContract === "No") {
        cy.get("#endofcontract2").click();
    } else {
        cy.get("#endofcontract1").click();
    }
});

/**
 * Select a solution type in quote creation.
 * @param {string} solutionType - 'standard' or 'custom'
 */
Cypress.Commands.add("selectSolution", (solutionType = "standard") => {
    const solutionMap = {
        standard: "#solution_standard",
        custom: "#solution_custom",
    };

    const solutionId = solutionMap[solutionType];
    if (!solutionId) {
        const typeValue =
            typeof solutionType === "string"
                ? solutionType
                : JSON.stringify(solutionType);
        throw new Error(
            `Invalid solution type: '${typeValue}'. Use 'standard' or 'custom'.`,
        );
    }

    cy.get(`${solutionId} > a > .picProcess`).should("be.visible").click();
});

/**
 * Configure Internet product line details.
 * @param {object} internetConfig - Internet line configuration
 */
Cypress.Commands.add("configureInternetLine", (internetConfig) => {
    cy.get('[name="bandwidth"]').clear().type(internetConfig.bandwidth);

    if (internetConfig.accessType === "ME") {
        cy.get('[name="accessTypeIdRadio"]').click();
    }

    if (internetConfig.sla) {
        cy.get(`#serviceLevelTypeId${internetConfig.sla}`).click();
    }

    cy.get('[name="resiliency"]').click();
    cy.get('[name="interfaceType"]').select(internetConfig.interfaceType, {
        force: true,
    });

    if (internetConfig.handoffInterface === "electrical") {
        cy.get('[value="electrical"]').click();
    } else if (internetConfig.handoffInterface === "optical") {
        cy.get('[value="optical"]').click();
    }
});

/**
 * Capture Quote ID text from the DOM.
 * @param {string} selector - CSS selector for the element containing the Quote ID
 * @returns {Cypress.Chainable<string>} Trimmed Quote ID text
 */
Cypress.Commands.add("captureQuoteId", (selector) => {
    return cy
        .get(selector)
        .should("be.visible")
        .invoke("text")
        .invoke("trim")
        .should("not.be.empty");
});

/**
 * Search for a quote by Quote ID in a specific tab.
 *
 * Each tab owns its own search fields (no shared <form> wrapper):
 *   waiting   → searchFrom / key   inside #frmSearchWaiting
 *   completed → searchFrom2 / key2 inside #approved
 *   other     → searchFrom3 / key3 inside #other
 *
 * @param {string} quoteId - Quote ID to search for
 * @param {string} tab     - 'waiting' | 'completed' | 'other'
 * @param {string} searchType - Search dropdown value (default: 'quoteid')
 */
Cypress.Commands.add(
    "searchQuoteById",
    (quoteId, tab = "waiting", searchType = "quoteid") => {
        const fieldMap = {
            waiting: {
                searchFrom: "searchFrom",
                key: "key",
                btnSelector:
                    "#frmSearchWaiting > table > tbody > :nth-child(2) > :nth-child(6) > .btn",
            },
            completed: {
                searchFrom: "searchFrom2",
                key: "key2",
                container: "#approved",
            },
            other: {
                searchFrom: "searchFrom3",
                key: "key3",
                container: "#other",
            },
        };

        const fields = fieldMap[tab];

        cy.get(`[name="${fields.searchFrom}"]`)
            .should("be.visible")
            .select(searchType);
        cy.get(`[name="${fields.key}"]`)
            .should("be.visible")
            .clear()
            .type(quoteId);

        // Waiting tab has a fixed selector; other tabs use cy.contains for resilience
        if (fields.btnSelector) {
            cy.get(fields.btnSelector).should("be.visible").click();
        } else {
            cy.get(fields.container)
                .contains(".btn-primary", "SEARCH")
                .should("be.visible")
                .click();
        }

        cy.contains(quoteId, { timeout: 15000 }).should("be.visible");
    },
);

/**
 * Approve a quote via the #frmApproval form.
 * All approval levels share the same form and confirm() onclick handler.
 */
Cypress.Commands.add("approveQuote", () => {
    cy.get('[onclick*="Confirm to submit approval"]')
        .should("be.visible")
        .click();
});

/**
 * Assign quote to a pricing team member.
 * @param {string} assignee - Assignee code (default: 'AMANDA')
 */
Cypress.Commands.add("assignQuoteToPricing", (assignee = "AMANDA") => {
    cy.get('[name="pricingAssignTo"]').should("be.visible").select(assignee);
    cy.get("#frmPricingAssignment > .panel > .panel-body > .btn")
        .should("be.visible")
        .click();
});

/**
 * Open a quote for editing from the Waiting Approval results.
 *
 * Extracts the link's resolved href and navigates via cy.visit() instead
 * of clicking.  This eliminates stale-element failures caused by AJAX
 * table re-renders between the assertion and the click.
 */
Cypress.Commands.add("openQuoteForEdit", () => {
    cy.get("#divWaitingQuoteResult > .table > tbody > tr", {
        timeout: 15000,
    }).should("have.length.at.least", 1);

    cy.get(
        "#divWaitingQuoteResult > .table > tbody > tr:first-child > :nth-child(14) > a",
    )
        .should("be.visible")
        .then(($a) => {
            // .prop('href') returns the fully resolved URL regardless of
            // whether the raw attribute is relative — immune to stale elements
            // once the string is captured.
            cy.visit($a.prop("href"));
        });
});

/**
 * Refresh quote list by switching to the "Other" tab.
 */
Cypress.Commands.add("refreshQuoteList", () => {
    cy.get("#myTab > :nth-child(3) > a").should("be.visible").click();
    cy.get("#myTab > :nth-child(3)").should("have.class", "active");
    cy.get("#other").should("be.visible");
    cy.get("#other .table", { timeout: 15000 }).should("exist");
});

/**
 * Switch to a specific tab on the quote dashboard.
 * @param {string} tabName - 'waiting' | 'completed' | 'other'
 */
Cypress.Commands.add("switchToTab", (tabName) => {
    const tabMap = {
        waiting: { index: 1, paneId: "#waiting" },
        completed: { index: 2, paneId: "#approved" },
        other: { index: 3, paneId: "#other" },
    };
    const tab = tabMap[tabName];
    if (!tab) {
        const typeValue =
            typeof tabName === "string" ? tabName : JSON.stringify(tabName);
        throw new Error(
            `Invalid tab: '${typeValue}'. Use 'waiting', 'completed', or 'other'.`,
        );
    }
    cy.get(`#myTab > :nth-child(${tab.index}) > a`)
        .should("be.visible")
        .click();
    cy.get(`#myTab > :nth-child(${tab.index})`).should("have.class", "active");
    cy.get(tab.paneId).should("be.visible");
});

// ─────────────────────────────────────────────────────────────────
// Cross-system login commands (credentials from cypress.env.json)
// ─────────────────────────────────────────────────────────────────

/**
 * Login to CRM (vtiger) via session caching.
 * Reads credentials from cypress.env.json (CRM_USERNAME / CRM_PASSWORD).
 * @param {string} [username] - Override username (default: Cypress.env('CRM_USERNAME'))
 * @param {string} [password] - Override password (default: Cypress.env('CRM_PASSWORD'))
 */
Cypress.Commands.add(
    "loginCRM",
    (
        username = Cypress.env("CRM_USERNAME"),
        password = Cypress.env("CRM_PASSWORD"),
    ) => {
        const CRM_BASE_URL = Cypress.env("CRM_BASE_URL");
        cy.session(["crm", username], () => {
            cy.visit(`${CRM_BASE_URL}/index.php`);
            cy.get('[name="user_name"]')
                .should("be.visible")
                .type(`{selectall}${username}`, { log: false });
            cy.get('[name="user_password"]')
                .should("be.visible")
                .type(`{selectall}${password}`, { log: false });
            cy.get("#signin-button").should("be.visible").click();
            cy.url({ timeout: 15000 }).should("include", "/crm/");
        });
    },
);

/**
 * Login to DWMS / COFR via session caching.
 * Handles ASP.NET double-login quirk automatically.
 * @param {string} username - DWMS username (e.g. Cypress.env('DWMS_MALIFF_USERNAME'))
 * @param {string} password - DWMS password
 */
Cypress.Commands.add("loginDWMS", (username, password) => {
    const DWMS_BASE_URL = Cypress.env("DWMS_BASE_URL");
    cy.session(["dwms", username], () => {
        const fillAndSubmit = () => {
            cy.get("#ctl00_ContentPlaceHolder1_txtUsername")
                .should("be.visible")
                .type(`{selectall}${username}`, { delay: 0, log: false });
            cy.get("#ctl00_ContentPlaceHolder1_txtPassword")
                .should("be.visible")
                .type(`{selectall}${password}`, { delay: 0, log: false });
            cy.get("#ctl00_ContentPlaceHolder1_btnLogin")
                .should("be.visible")
                .click();
        };

        cy.visit(`${DWMS_BASE_URL}/login.aspx`);
        fillAndSubmit();

        // Handle ASP.NET double-login quirk
        cy.url({ timeout: 10000 }).then((url) => {
            if (url.includes("login.aspx")) {
                    cy.visit(`${DWMS_BASE_URL}/login.aspx`);
                fillAndSubmit();
            }
        });

        cy.url({ timeout: 15000 }).should("include", "/myapplications.aspx");
    });
});

/**
 * Login to ATOM via session caching.
 * Reads credentials from cypress.env.json (ATOM_USERNAME / ATOM_PASSWORD).
 * @param {string} [username] - Override username (default: Cypress.env('ATOM_USERNAME'))
 * @param {string} [password] - Override password (default: Cypress.env('ATOM_PASSWORD'))
 */
Cypress.Commands.add(
    "loginATOM",
    (
        username = Cypress.env("ATOM_USERNAME"),
        password = Cypress.env("ATOM_PASSWORD"),
    ) => {
        const ATOM_BASE_URL = Cypress.env("ATOM_BASE_URL");
        cy.session(["atom", username], () => {
            cy.visit(`${ATOM_BASE_URL}/atoms/public/gate/authentication`);
            cy.get("form", { timeout: 10000 }).should("be.visible");
            cy.get('[name="username"]')
                .should("be.visible")
                .type(`{selectall}${username}`, { log: false });
            cy.get('[name="password"]')
                .should("be.visible")
                .type(`{selectall}${password}`, { log: false });
            cy.get('[name="crm_auth"]').should("be.visible").check();
            cy.get('button[type="submit"]').should("be.visible").click();
            cy.url({ timeout: 15000 }).should(
                "not.include",
                "/gate/authentication",
            );
        });
    },
);

/**
 * Safe DOM polling that waits for an element to become visible without failing the test.
 * Resolves to true if found, false if it timed out.
 *
 * @param {string} selector - The CSS selector to wait for
 * @param {number} timeout - Max time to wait in ms
 * @param {number} interval - Polling interval in ms
 */
Cypress.Commands.add(
    "waitUntilVisible",
    (selector, timeout = 15000, interval = 500) => {
        return cy.wrap(null, { log: false }).then(() => {
            return new Cypress.Promise((resolve) => {
                const startTime = Date.now();

                const checkFocus = () => {
                    const $el = Cypress.$(selector);
                    if ($el.length > 0 && $el.is(":visible")) {
                        resolve(true);
                    } else if (Date.now() - startTime >= timeout) {
                        resolve(false);
                    } else {
                        setTimeout(checkFocus, interval);
                    }
                };
                checkFocus();
            });
        });
    },
);

/**
 * Wait for an intercepted route but continue gracefully if it times out.
 * Useful for brittle ASP.NET postbacks that might not fire if the UI state
 * doesn't require a server roundtrip.
 */
Cypress.Commands.add("waitOptional", (alias, timeout = 3000) => {
    // We register a one-time global exception handler to swallow the specific
    // "No request ever occurred" error thrown by cy.wait()
    const handleUncaught = (err) => {
        if (err.message.includes("No request ever occurred")) {
            return false; // Swallow the error
        }
        throw err;
    };

    cy.on("fail", handleUncaught);

    // Wait for the alias, then immediately unregister the handler
    // If it succeeds, the .then() unregisters. If it fails, the catch handles it.
    cy.wait(alias, { timeout }).then(
        () => {
            cy.off("fail", handleUncaught);
        },
        (err) => {
            cy.off("fail", handleUncaught);
            cy.log(`Wait for ${alias} timed out (optional, continuing...)`);
        },
    );
});
