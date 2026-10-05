import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const jobs = [
  { title: "Hotel Receptionist", company: "Abuja Hospitality Group", district: "Wuse", salary: 120000, energyCost: 18, xpReward: 60 },
  { title: "Digital Marketer", company: "Capital Creative", district: "Maitama", salary: 220000, energyCost: 16, xpReward: 90 },
  { title: "Software Developer", company: "Abuja Tech Hub", district: "Jabi", salary: 350000, energyCost: 20, xpReward: 120 },
  { title: "Sales Officer", company: "Garki Business Centre", district: "Garki", salary: 150000, energyCost: 18, xpReward: 70 },
  { title: "Fitness Trainer", company: "Jabi Fitness Club", district: "Jabi", salary: 140000, energyCost: 22, xpReward: 75 },
];

const missions = [
  { key: "first-shift", title: "First Day", description: "Complete your first work shift in Abuja.", rewardCash: 25000, rewardXp: 100 },
  { key: "explore-city", title: "Know Your City", description: "Visit three Abuja districts.", rewardCash: 15000, rewardXp: 75 },
  { key: "save-money", title: "Start Saving", description: "Put money into your bank account.", rewardCash: 10000, rewardXp: 50 },
];

async function main() {
  for (const job of jobs) {
    await prisma.job.upsert({
      where: { title: job.title },
      update: job,
      create: job,
    });
  }

  for (const mission of missions) {
    await prisma.mission.upsert({
      where: { key: mission.key },
      update: mission,
      create: mission,
    });
  }

  console.log("Abuja Real Life database seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
