-- Maintain modified_date_time (epoch seconds) on UPDATE; column default only applies on INSERT.
-- Reuses trigger_set_modified_date_time_epoch from V3_210__add_modified_function.sql
DROP TRIGGER IF EXISTS trigger_recording_clone_modified_date_time ON recording.recording_clone;
CREATE TRIGGER trigger_recording_clone_modified_date_time
  BEFORE UPDATE ON recording.recording_clone
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_modified_date_time_epoch();
