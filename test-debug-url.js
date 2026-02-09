// Test URL parsing logic from application
const testUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSctkwDOrFYNPzcOQRYmixTpyjDaXnKJW9lY85W5rlX-IJuDxw/formResponse?entry.463116679=%40affan&entry.874088795=Perempuan';

console.log('Testing URL parsing:\n');
console.log('Original URL:', testUrl);

const url = new URL(testUrl);
console.log('\nParsed URL:');
console.log('- hostname:', url.hostname);
console.log('- pathname:', url.pathname);
console.log('- search:', url.search);
console.log('- search.substring(1):', url.search.substring(1));

const formData = url.search.substring(1);
console.log('\nForm Data:', formData);
console.log('Form Data Length:', formData.length);

// Check if it starts with &
if (formData.startsWith('&')) {
    console.log('\n❌ ERROR: Form data starts with &');
} else {
    console.log('\n✅ OK: Form data does not start with &');
}
