-- CreateTable
CREATE TABLE "Course" (
    "id" SERIAL NOT NULL,
    "course_name" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "open_seats" INTEGER NOT NULL,
    "waitlist_count" INTEGER NOT NULL,
    "class_times" JSONB NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "custom_course_id" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_custom_course_id_key" ON "Course"("custom_course_id");
