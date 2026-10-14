-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "shortname" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryPicture" TEXT NOT NULL,
    "picture" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "last" TEXT NOT NULL
);
