const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Replace with the email you want to promote
    const emailToPromote = 'affankhulafa@gmail.com'; // CHANGE THIS IF NEEDED, defaulting to likely owner or first user

    try {
        // Option 1: Promote specific email
        // const user = await prisma.user.update({
        //     where: { email: emailToPromote },
        //     data: { role: 'ADMIN' }
        // });

        // Option 2: Promote the FIRST user found (easier for dev)
        const firstUser = await prisma.user.findFirst();
        if (firstUser) {
            const user = await prisma.user.update({
                where: { id: firstUser.id },
                data: { role: 'ADMIN' }
            });
            console.log(`User ${user.email} (ID: ${user.id}) is now ADMIN.`);
        } else {
            console.log("No users found to promote.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
