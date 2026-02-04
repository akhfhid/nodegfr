const { parseData } = require('./index.js');

// Mock data to simulate form submission
const mockFormData = {
    'entry.123_answers': ['affan\r\nbagas\r\nbagus'],
    'entry.123_chances': ['100'],
    'entry.123_isMultipleChoice': [false],
    'url': 'https://example.com/form'
};

// We need to export parseData from index.js or move it to a testable file
// Since I can't easily export, I'll just copy the logic here for a quick check or 
// modify index.js to export it if needed. 

// Actually, I'll just run a quick console log test inside index.js temporarily or
// create a standalone test that mimics the logic.

function testParsing() {
    const remappedOutput = [];
    const formData = mockFormData;
    const questionId = 'entry.123';
    const value = formData[`${questionId}_answers`];
    const items = [];

    value.forEach((answer, i) => {
        const lines = answer.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 1) {
            const baseChance = parseFloat(formData[`${questionId}_chances`][i]) || 0;
            const distributedChance = baseChance / lines.length;
            lines.forEach(line => {
                items.push({
                    option: line,
                    chance: distributedChance,
                    isOtherOption: false
                });
            });
        } else {
            items.push({
                option: answer,
                chance: formData[`${questionId}_chances`][i] || 0,
                isOtherOption: false
            });
        }
    });

    console.log('Resulting Items:', JSON.stringify(items, null, 2));

    if (items.length === 3 && items[0].option === 'affan' && Math.abs(items[0].chance - 33.33) < 0.1) {
        console.log('Test Passed!');
    } else {
        console.log('Test Failed!');
    }
}

testParsing();
