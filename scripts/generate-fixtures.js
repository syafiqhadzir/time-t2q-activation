const fs = require('fs');
const path = require('path');

/**
 * Script to generate fixture files that are excluded from git.
 * These files are required for the Cypress tests to track state 
 * and store generated IDs (e.g., Funnel ID, Quote ID) during the pipeline.
 */

const fixturesDir = path.join(__dirname, '..', 'cypress', 'fixtures');

// Define the files and their default content
const fixtures = [
    {
        name: 'shared-quote-id.json',
        content: JSON.stringify({ quoteId: "", funnelNo: "" }, null, 2)
    },
    {
        name: 'cofr-submission.json',
        content: JSON.stringify({ submissionNo: "", status: "" }, null, 2)
    },
    {
        name: 'README.md',
        content: '# Test Run Artifacts\n\nThis directory contains dynamic fixture data produced during test runs. These files are excluded from version control to prevent state collisions between developers.'
    }
];

// Ensure the fixtures directory exists
if (!fs.existsSync(fixturesDir)) {
    console.log(`Creating directory: ${fixturesDir}`);
    fs.mkdirSync(fixturesDir, { recursive: true });
}

// Generate each file if it doesn't already exist
fixtures.forEach(fixture => {
    const filePath = path.join(fixturesDir, fixture.name);
    
    if (!fs.existsSync(filePath)) {
        console.log(`Generating excluded fixture file: ${fixture.name}`);
        fs.writeFileSync(filePath, fixture.content, 'utf8');
    } else {
        console.log(`Fixture file already exists, skipping: ${fixture.name}`);
    }
});

console.log('✓ All exclude fixture files are verified/generated.');
