DO
$$BEGIN
    CREATE TRIGGER job_modified_date_time_epoch
        BEFORE UPDATE
        ON job_new.job
        FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_modified_date_time_epoch();
EXCEPTION
   WHEN duplicate_object THEN
      NULL;
END;
$$;

DO
$$BEGIN
    CREATE TRIGGER task_modified_date_time_epoch
        BEFORE UPDATE
        ON job_new.task
        FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_modified_date_time_epoch();
EXCEPTION
   WHEN duplicate_object THEN
      NULL;
END;
$$;
