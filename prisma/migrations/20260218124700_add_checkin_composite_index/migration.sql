-- CreateIndex
CREATE INDEX "CheckIn_expiresAt_mode_targetId_idx" ON "CheckIn"("expiresAt", "mode", "targetId");
