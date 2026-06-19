// ***********************************************************
// Global support file — loaded automatically before every spec.
// https://on.cypress.io/configuration#supportFile
// ***********************************************************

import "./commands";

// ---------------------------------------------------------------
// Centralised uncaught exception handler
// ---------------------------------------------------------------
// Errors from all applications in the pipeline are consolidated here.
// Individual specs no longer need their own Cypress.on() handlers.
// Add new benign patterns here as they surface.
Cypress.on("uncaught:exception", (err) => {
    const ignoredPatterns = [
        // Global / DOM
        "Cannot read properties of null",
        "Cannot read properties of undefined",
        "ResizeObserver loop",
        "can't access property",
        // CRM (vtiger) UI quirks
        "Cannot set properties of null",
        // Time2Quote UI quirks
        "Error: error - error",
        "JSON.parse: unexpected end of data",
        // DWMS ASP.NET legacy framework (cofr.cy.js)
        "BlynkAJAXPageLoad",
        "dispatchEvent",
        "identifier starts immediately after numeric literal",
        "Invalid or unexpected token",
        "is not defined",
        // ATOM UI quirks (atom.cy.js)
        "USERNAME is not defined",
        "Request failed with status code 500",
    ];
    return !ignoredPatterns.some((pattern) => err.message.includes(pattern));
});
