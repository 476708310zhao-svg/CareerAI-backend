-- Sprint 2.5 baseline marker for the schema that existed before versioned migrations.
-- This file deliberately does not replay historical DDL. The runner verifies the
-- critical tables and columns below before recording the baseline version.
-- @require-table users:id,openid
-- @require-table resumes:id,user_id,resume_type,current_version_id
-- @require-table applications:id,user_id,job_id,v4_status,progress_status
-- @require-table analytics_events:id,event_name,data_class,is_test,event_version
-- @require-table user_profiles:user_id,profile_version
-- @require-table resume_versions_v4:id,resume_id,version_no
-- @require-table ai_agent_tasks_v4:id,user_id,status
-- @require-table interview_spaces_v4:id,user_id
-- @require-table orders:id,order_no,user_id,provider
-- @require-table aggregated_jobs:id,source,apply_url
-- @require-table cron_logs:id,status,ran_at
-- @require-table oa_questions:id,user_id,status

SELECT 1;
