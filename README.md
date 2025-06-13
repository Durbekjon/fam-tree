# Shajara - Family Tree Telegram Bot

A Telegram bot for creating and managing family trees, with a focus on Uzbek culture and traditions.

## Features

- Create and manage family trees
- Add family members with different relationships
- View family tree in Telegram
- Merge trees when finding common relatives
- Privacy controls for family members
- Localization support (Uzbek and English)

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd shajara-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shajara?schema=public"
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
JWT_SECRET=your_jwt_secret_here
```

4. Set up the database:
```bash
# Install PostgreSQL if not already installed
brew install postgresql@14
brew services start postgresql@14

# Create the database
createdb shajara

# Run Prisma migrations
npx prisma migrate dev --name init
```

5. Start the application:
```bash
npm run start:dev
```

## Bot Commands

- `/start` - Start the bot and get welcome message
- `/add` - Add a new family member
- `/view` - View your family tree
- `/help` - Get help with bot commands

## Development

The project is built with:
- NestJS - Backend framework
- Prisma - Database ORM
- PostgreSQL - Database
- Telegraf - Telegram Bot framework

## Project Structure

```
src/
├── config/           # Configuration files
├── prisma/          # Prisma configuration and service
├── services/        # Shared services
├── telegram/        # Telegram bot related code
│   ├── controllers/ # Bot command handlers
│   └── services/    # Bot business logic
├── web/            # Web interface
│   └── controllers/ # Web routes
└── main.ts         # Application entry point
```

## Database Schema

The application uses Prisma with the following models:

```prisma
model User {
  id          String         @id @default(uuid())
  telegramId  String         @unique
  phoneNumber String?
  nickname    String?
  language    String         @default("uz")
  familyMembers FamilyMember[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model FamilyMember {
  id          String         @id @default(uuid())
  fullName    String
  birthYear   Int?
  deathYear   Int?
  photoUrl    String?
  relationType RelationType
  isPrivate   Boolean        @default(false)
  userId      String
  user        User           @relation(fields: [userId], references: [id])
  relatedTo   FamilyMember[] @relation("FamilyRelations")
  relatedFrom FamilyMember[] @relation("FamilyRelations")
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
