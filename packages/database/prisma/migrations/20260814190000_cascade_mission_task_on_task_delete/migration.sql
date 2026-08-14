-- A MissionTask is a join record owned by its task and must not prevent
-- legitimate task or project cleanup through the Project -> Task cascade.
ALTER TABLE "MissionTask" DROP CONSTRAINT "MissionTask_taskId_fkey";
ALTER TABLE "MissionTask"
ADD CONSTRAINT "MissionTask_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
