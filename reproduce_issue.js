
function selectIndependentOptions(optionsWithProbabilities) {
    const selectedOptions = [];
    for (const item of optionsWithProbabilities) {
        const chance = parseFloat(item.chance);
        const probability = chance > 1 ? chance / 100 : chance;
        if (Math.random() < probability) {
            selectedOptions.push(item);
        }
    }
    return selectedOptions;
}

function selectWeightedRandomItem(optionsWithWeights) {
    let totalWeight = 0;
    for (const item of optionsWithWeights) {
        totalWeight += parseFloat(item.chance);
    }
    if (totalWeight === 0) return optionsWithWeights[0];
    const randomNumber = Math.random() * totalWeight;
    let cumulativeWeight = 0;

    for (const item of optionsWithWeights) {
        cumulativeWeight += parseFloat(item.chance);
        if (randomNumber < cumulativeWeight) {
            return item;
        }
    }
    return optionsWithWeights[optionsWithWeights.length - 1];
}

// Simulated decodeToGoogleFormUrl core logic
function testDecider(isMultipleChoice, items, iterationIndex) {
    let selections = [];
    if (isMultipleChoice) {
        const selectedItems = selectIndependentOptions(items);
        if (selectedItems.length === 0) {
            const fallback = selectWeightedRandomItem(items);
            if (fallback && parseFloat(fallback.chance) > 0) {
                selectedItems.push(fallback);
            }
        }
        selections = selectedItems.map(i => i.option);
    } else {
        const selectedResult = selectWeightedRandomItem(items);
        if (selectedResult) {
            selections = [selectedResult.option];
        }
    }
    return selections;
}

// Test Case 1: Single Choice (Radio/Linear Scale)
const itemsSingle = [
    { option: '1', chance: 0 },
    { option: '2', chance: 100 },
    { option: '3', chance: 0 }
];

console.log("Testing Single Choice (100% on option '2'):");
let results = [];
for (let i = 0; i < 100; i++) {
    results.push(testDecider(false, itemsSingle, i)[0]);
}
const counts = results.reduce((acc, val) => { acc[val] = (acc[val] || 0) + 1; return acc; }, {});
console.log(counts);

// Test Case 2: Checkboxes
const itemsMulti = [
    { option: 'A', chance: 100 },
    { option: 'B', chance: 0 },
    { option: 'C', chance: 100 }
];

console.log("\nTesting Checkboxes (100% on 'A' and 'C', 0% on 'B'):");
let multiResults = [];
for (let i = 0; i < 100; i++) {
    multiResults.push(testDecider(true, itemsMulti, i));
}
const bSelected = multiResults.filter(r => r.includes('B')).length;
const aSelected = multiResults.filter(r => r.includes('A')).length;
const cSelected = multiResults.filter(r => r.includes('C')).length;
console.log(`Results: A=${aSelected}, B=${bSelected}, C=${cSelected}`);
