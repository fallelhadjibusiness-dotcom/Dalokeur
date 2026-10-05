CREATE TABLE "uploaded_files" (
    "key" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attached_at" TIMESTAMP(3),
    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "uploaded_files_owner_id_created_at_idx" ON "uploaded_files"("owner_id", "created_at");
CREATE INDEX "uploaded_files_attached_at_created_at_idx" ON "uploaded_files"("attached_at", "created_at");
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
