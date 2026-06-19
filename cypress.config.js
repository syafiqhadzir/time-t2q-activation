const { defineConfig } = require("cypress");
const { PDFParse } = require("pdf-parse");
const fs = require("node:fs");
const path = require("node:path");

const SHARED_FIXTURE = path.join(
    __dirname,
    "cypress/fixtures/shared-quote-id.json",
);

module.exports = defineConfig({
    e2e: {
        // Credentials are read from cypress.env.json via Cypress.env() in all specs.
        env: {
            ESO_BASE_URL: "https://eso-stg2.time.com.my",
            CRM_BASE_URL: "https://apps-stg2.time.com.my/crm",
            DWMS_BASE_URL: "https://dwmsitv.time.com.my",
            ATOM_BASE_URL: "https://atom-stg2.time.com.my",
        },

        // Base URL for the Time2Quote application
        baseUrl: "https://time2quote-stg2.time.com.my",

        // Viewport configuration
        viewportWidth: 1920,
        viewportHeight: 1080,

        // Timeout configurations
        defaultCommandTimeout: 10000,
        pageLoadTimeout: 30000,
        requestTimeout: 15000,
        responseTimeout: 30000, // PDF generation can be slow

        // Retry configuration — one retry in CI catches transient issues
        // without wasting time on genuine failures
        retries: {
            runMode: 1,
            openMode: 0,
        },

        // Video and screenshot configuration
        video: true,
        screenshotOnRunFailure: true,

        // Keep only the latest test snapshot in memory to reduce heap usage
        numTestsKeptInMemory: 1,

        // Spec execution order — mirrors the data pipeline:
        //   t2q (creates quoteId) → eso (creates serviceOrderNo) → crm (consumes both)
        specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",

        setupNodeEvents(on, config) {
            // ── Cypress Tasks (run in Node.js) ──
            on("task", {
                /**
                 * Parse a PDF binary string and return plain-text content.
                 * Used by eso.cy.js to extract Service Order No from compressed PDF streams.
                 *
                 * @param {string} pdfBinaryString - Binary string from cy.request({ encoding: 'binary' })
                 * @returns {Promise<string>} Full extracted text from all PDF pages
                 */
                async parsePdf(pdfBinaryString) {
                    const buffer = Buffer.from(pdfBinaryString, "binary");
                    const parser = new PDFParse({ data: buffer });
                    const result = await parser.getText();
                    await parser.destroy();
                    return result.text;
                },

                /**
                 * Atomically merge new data into the shared fixture file.
                 * Runs in Node.js to avoid browser-side read→spread→write race conditions.
                 *
                 * Usage in specs:
                 *   cy.task('mergeFixture', { funnelNo, email })
                 *
                 * @param {object} newData - Key-value pairs to merge into the fixture
                 * @returns {null}
                 */
                mergeFixture(newData) {
                    let existing = {};
                    if (fs.existsSync(SHARED_FIXTURE)) {
                        try {
                            existing = JSON.parse(
                                fs.readFileSync(SHARED_FIXTURE, "utf8"),
                            );
                        } catch {
                            existing = {};
                        }
                    }
                    const merged = { ...existing, ...newData };
                    fs.writeFileSync(
                        SHARED_FIXTURE,
                        JSON.stringify(merged, null, 2),
                    );
                    return null;
                },

                /**
                 * Safely read the shared fixture file.
                 * Returns {} on missing file, empty file, or corrupt JSON —
                 * unlike cy.readFile() which hard-throws on empty/invalid JSON.
                 *
                 * Usage in specs:
                 *   cy.task('readFixture').then((data) => { if (data.quoteId) ... })
                 *
                 * @returns {object} Parsed fixture object, or {} on any error
                 */
                readFixture() {
                    if (!fs.existsSync(SHARED_FIXTURE)) return {};
                    try {
                        const raw = fs
                            .readFileSync(SHARED_FIXTURE, "utf8")
                            .trim();
                        return raw ? JSON.parse(raw) : {};
                    } catch {
                        return {};
                    }
                },
            });

            return config;
        },
    },
});
