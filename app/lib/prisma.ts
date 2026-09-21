import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Đọc URL từ biến môi trường
const connectionString = `${process.env.DATABASE_URL}`;

// Khởi tạo Connection Pool và Adapter
const pool = new Pool({ connectionString, ssl: true });
const adapter = new PrismaPg(pool);

// Đảm bảo chỉ có một instance Prisma trong môi trường dev
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
