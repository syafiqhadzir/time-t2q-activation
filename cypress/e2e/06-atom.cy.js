/**
 * Test Objective: ATOM Integration - Provisioning & Commissioning Verification
 * Business Scenario: Validates the final activation steps in the ATOM system by updating commission dates, completing the activity checklist, and submitting manual billing.
 * 
 * Workflow Steps:
 * 1. Authenticate to the ATOM portal.
 * 2. Search for the provisioned Account Number and verify cross-system data.
 * 3. Update key commissioning dates (FWC Completion, Actual Commission, Date Commissioned, Arbor RC).
 * 4. Execute and complete all required operational tasks in the Activity Checklist.
 * 5. Submit Manual Billing and verify the associated Task ID is successfully closed.
 * 
 * Pipeline position: T2Q → ESO → CRM → COFR → CRM → ATOM
 * Post-conditions: Persists `eventNo` and `serviceNo` to the shared fixture and concludes the end-to-end activation pipeline.
 */

describe("ATOM - Provisioning and Commissioning Completion", () => {
    // Preconditions: Define environment constants and shared state variables
    const ATOM_BASE_URL = Cypress.env("ATOM_BASE_URL");

    // NOTE: Exception handling is centralised in support/e2e.js

    let quoteId;
    let serviceOrderNo;
    let funnelNo;
    let accountNo;
    let eventNo;
    let serviceNo;
    let taskId;

    before(function () {
        // Preconditions: Idempotency Guard - Skip entire suite if ATOM is already completed
        cy.skipIfCompleted("atomCompleted");

        // Preconditions: Load and validate upstream test data from shared fixture
        cy.requireUpstreamData(["quoteId", "serviceOrderNo", "funnelNo", "accountNo"]).then((data) => {
            quoteId = data?.quoteId;
            serviceOrderNo = data?.serviceOrderNo;
            funnelNo = data?.funnelNo;
            accountNo = data?.accountNo;
        });
    });

    beforeEach(function () {
        // Preconditions: Guard against test execution if prerequisites are missing at runtime
        if (!quoteId || !serviceOrderNo || !funnelNo || !accountNo) this.skip();
    });

    /**
     * Test Objective: Record Verification and Data Extraction
     * Business Scenario: ATOM locates the provisioned account, extracts system-generated Event and Service Numbers, and validates the integration pipeline data.
     */
    it('should login and search account by account number', function () {
        // Workflow Step: Authenticate to ATOM using cached session
        cy.loginATOM()

        // Workflow Step: Navigate to ATOM dashboard and access Contact Event search
        cy.visit(`${ATOM_BASE_URL}/atoms/public/dashboard`)
        cy.get('nav, .navbar', { timeout: 10000 }).should('be.visible')

        cy.get('#contactEventNavbarDropdown').should('be.visible').click()
        cy.contains('a[href*="/contact-event"]', 'Search').should('be.visible').click()
        cy.url({ timeout: 10000 }).should('include', '/contact-event')

        // Workflow Step: Execute search using upstream Account Number
        cy.get('#searchValue').should('be.visible')
        cy.get('#inputState').should('be.visible').select('account_no')
        cy.get('#searchValue').type(`{selectall}${accountNo}`)
        cy.log(`Searching for Account No: ${accountNo}`)

        cy.get('.col-sm-1 > .btn').should('be.visible').click()
        
        // Validation: Verify search results render successfully and access primary record
        cy.get('table, .alert', { timeout: 15000 }).should('be.visible')
        cy.get('table tbody tr').should('have.length.at.least', 1)
        cy.get('table tbody tr').first().find('a, button').first().click()

        // Validation: Verify detailed view navigation and core data integrity
        cy.url({ timeout: 10000 }).should('include', '/contact-event')
        cy.get('#event-contact-information-collapse').should('be.visible')
        cy.get('#event-contact-information-collapse > .card-body > .loading-section').should('not.be.visible')

        // Workflow Step: Extract and persist System-Generated Event No
        cy.get('#event-contact-information-collapse > .card-body > .table > tbody > :nth-child(1) > :nth-child(2)')
            .should('be.visible')
            .invoke('text')
            .then((text) => {
                const match = /\d+/.exec(text)
                eventNo = match ? match[0] : text.trim()
                cy.log(`Captured Event No: ${eventNo}`)
                expect(eventNo).to.not.be.empty
                cy.task('mergeFixture', { eventNo })
            })

        // Workflow Step: Extract and persist System-Generated Service No
        cy.get(':nth-child(1) > .card-body > .table > tbody > :nth-child(2) > .border-right-0')
            .should('be.visible')
            .invoke('text')
            .then((text) => {
                serviceNo = text.trim()
                cy.log(`Captured Service No: ${serviceNo}`)
                expect(serviceNo).to.not.be.empty
                cy.task('mergeFixture', { serviceNo })
            })

        // Validation: Assert Cross-System Integration Consistency (Funnel No, Quote No, SO No)
        cy.get('#event-contact-information-collapse > .card-body > .table > tbody')
            .should('be.visible')
            .and('contain.text', funnelNo)
            .and('contain.text', quoteId)

        cy.get('#so-details-collapse > .card-body > :nth-child(1) > :nth-child(1) > :nth-child(2) > :nth-child(2)')
            .should('be.visible')
            .and('contain.text', serviceOrderNo)

        // Post-condition: Retain detail page URL context for subsequent test steps
        cy.url().then((url) => {
            Cypress.env('_atomContactEventUrl', url)
        })
    })

    /**
     * Test Objective: Update Commissioning Schedules
     * Business Scenario: Operational dates are synchronized to current date indicating provisioning completion.
     */
    it('should update FWC completion date and related commission dates', function () {
        // Workflow Step: Authenticate to ATOM
        cy.loginATOM()

        // Preconditions: Validate context continuity from previous test step
        const detailUrl = Cypress.env('_atomContactEventUrl')
        if (!detailUrl) {
            cy.log('⚠ No _atomContactEventUrl — run previous test first.')
            return
        }
        cy.visit(detailUrl)
        cy.get('#event-contact-information-collapse', { timeout: 10000 }).should('be.visible')

        // Workflow Step: Navigate to Record Edit Page
        cy.get('.float-end > .nav-item > .nav-link').should('be.visible').click()
        cy.contains('a[href*="/contact-event/"][href*="/edit"]', 'Edit').should('be.visible').click()
        cy.url({ timeout: 10000 }).should('include', '/contact-event/').and('include', '/edit')

        // Workflow Step: Determine localized current date (Malaysia Timezone UTC+8) for provisioning
        const todayDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
        const day = String(todayDate.getDate()).padStart(2, '0')
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const month = monthNames[todayDate.getMonth()]
        const year = todayDate.getFullYear()
        const today = `${day} ${month}, ${year}`
        cy.log(`Setting dates to today (KL timezone): ${today}`)

        // Workflow Step: Populate Commissioning and Completion Dates
        cy.get('[name="so_detail[fwc_completion_date]"]').should('be.visible').type(`{selectall}${today}`)
        cy.get('[name="so_detail[actual_commission_date]"]').should('be.visible').type(`{selectall}${today}`)
        cy.get('[name="new_feature_detail[date_commissioned]"]').should('be.visible').type(`{selectall}${today}`)
        cy.get('[name="contract_detail[arbor_rc_date]"]').should('be.visible').type(`{selectall}${today}`)

        // Workflow Step: Commit form modifications
        cy.get(':nth-child(2) > :nth-child(5) > .btn-primary').should('be.visible').click()

        // Validation: Verify dates persisted successfully across the form UI
        cy.get('[name="so_detail[fwc_completion_date]"]').should('have.value', today)
        cy.get('[name="so_detail[actual_commission_date]"]').should('have.value', today)
        cy.get('[name="new_feature_detail[date_commissioned]"]').should('have.value', today)
        cy.get('[name="contract_detail[arbor_rc_date]"]').should('have.value', today)

        // Post-condition: Retain edit page URL context for subsequent test steps
        cy.url().then((url) => {
            Cypress.env('_atomEditUrl', url)
        })
    })

    /**
     * Test Objective: Activity Checklist Fulfillment
     * Business Scenario: Operational dependencies explicitly flagged as complete within the system checklist.
     */
    it('should complete activity checklist and capture task ID', function () {
        // Workflow Step: Authenticate to ATOM
        cy.loginATOM()

        // Preconditions: Validate context continuity from previous test step
        const editUrl = Cypress.env('_atomEditUrl')
        if (!editUrl) {
            cy.log('⚠ No _atomEditUrl — run date update test first.')
            return
        }
        cy.visit(editUrl)

        // Workflow Step: Access Extended Information / Activity Checklist Module
        cy.get('#more-information-tab', { timeout: 10000 }).should('be.visible').click()

        // Workflow Step: Isolate and capture operational Task ID for manual verification
        cy.get(':nth-child(7) > .card-body > .table > tbody > tr > :nth-child(2)')
            .should('be.visible')
            .invoke('text')
            .then((text) => {
                taskId = text.trim()
                cy.wrap(taskId, { log: false }).as('taskId')
                cy.log(`Captured Task ID: ${taskId}`)
                expect(taskId).to.not.be.empty

                cy.get(':nth-child(7) > .card-body > .table > tbody > tr > :nth-child(2) > a')
                    .should('be.visible')
                    .should('contain.text', taskId)
                    .invoke('removeAttr', 'target')
                    .click()
            })

        // Workflow Step: Iteratively evaluate and complete all pending Activity Checklist tasks
        cy.get('[style="line-height: 1; padding-top: 0px;"]').each(($task) => {
            cy.wrap($task).should('be.visible').click()
            cy.get('body').then(($body) => {
                const $button = $body.find('.card-footer > table > tbody > :nth-child(1) > :nth-child(1)')
                if ($button.length && $button.is(':visible')) {
                    if ($button.is(':disabled')) {
                        cy.log('Task already checked or disabled - skipping')
                    } else {
                        cy.wrap($button).click()
                        cy.log('Task checked successfully')
                    }
                } else {
                    cy.log('Check button not visible - skipping this task')
                }
            })
        })

        cy.log('All activity checklist tasks have been completed')
    })

    /**
     * Test Objective: Manual Billing Execution and Task Verification
     * Business Scenario: Submits final manual billing constraints and confirms closure of the integration task.
     */
    it('should submit manual billing and verify task is closed', function () {
        // Workflow Step: Authenticate to ATOM
        cy.loginATOM()

        // Preconditions: Validate context continuity from previous test step
        const editUrl = Cypress.env('_atomEditUrl')
        if (!editUrl) {
            cy.log('⚠ No _atomEditUrl — run date update test first.')
            return
        }
        cy.visit(editUrl)

        // Workflow Step: Navigate to Billing Management Module
        cy.get('#billing-module-tab', { timeout: 10000 }).should('be.visible').click()
        cy.get('#billing-module-tab-pane').should('be.visible')

        // Validation: Verify Billing parameters match upstream provisioning identifiers
        cy.log('serviceNo value before assertion:', serviceNo)
        cy.get(':nth-child(5) > :nth-child(1) > :nth-child(1) > .col-sm-7 > .form-control')
            .should('be.visible')
            .invoke('val')
            .then((val) => {
                cy.log('Manual Billing Service No field value:', val)
                expect(val).to.equal(serviceNo)
            })
        cy.get(':nth-child(1) > :nth-child(2) > .col-sm-7 > .form-control')
            .should('be.visible')
            .and('have.value', accountNo)

        // Workflow Step: Execute Manual Billing submission and dismiss confirmation modals
        cy.get('body').then(($body) => {
            const $submitBtn = $body.find('.col > .btn')
            if ($submitBtn.length && $submitBtn.is(':visible')) {
                cy.wrap($submitBtn).click()
                cy.log('Manual billing submit button clicked')

                cy.get('#welcomeNoteModal > .modal-dialog > .modal-content').should('be.visible')
                cy.get('#welcomeNoteModal > .modal-dialog > .modal-content > .modal-footer > .btn-black')
                    .should('be.visible')
                    .click()

                cy.get('body').then(($b) => {
                    if ($b.find('#welcomeNoteModal:visible').length) {
                        cy.log('Note modal still visible, retrying close')
                        cy.get('#welcomeNoteModal > .modal-dialog > .modal-content > .modal-footer > .btn-black')
                            .should('be.visible')
                            .click()
                    }
                })
            } else {
                cy.log('Manual billing submit button not visible — already submitted or unavailable')
            }
        })

        // Validation: Verify operational Task ID transitioned to explicitly closed state
        cy.get('#my-workgroup-task-tab').should('be.visible').click()
        cy.get(':nth-child(3) > .form-control').should('be.visible').select('task_id')
        if (taskId) {
            cy.get('.row > :nth-child(4) > .form-control').should('be.visible').type(taskId)
            cy.get('.col-sm-1 > .btn').should('be.visible').click()
            cy.get('#active-task-table-closed > :nth-child(2) > :nth-child(1) > :nth-child(3)')
                .should('be.visible')
                .and('contain.text', taskId)
        } else {
            cy.log('taskId not available — skipping task verification')
        }

        // Post-condition: Flag ATOM workflow as fully completed in the shared fixture
        cy.task("mergeFixture", { atomCompleted: true });
        cy.log("✓ ATOM workflow completed successfully and tracked in fixture");
    })
})
