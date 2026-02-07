const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const voucher = await prisma.voucher.upsert({
            where: { code: 'DISKON50' },
            update: {},
            create: {
                code: 'DISKON50',
                percent: 50,
                description: 'Voucher Diskon 50% Testing',
                active: true
            }
        });
        console.log("Voucher created:", voucher);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
