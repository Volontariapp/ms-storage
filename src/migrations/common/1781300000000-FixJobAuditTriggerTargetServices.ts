import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixJobAuditTriggerTargetServices1781300000000 implements MigrationInterface {
  name = 'FixJobAuditTriggerTargetServices1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_job_audit_status_change()
      RETURNS TRIGGER AS $$
      DECLARE
        stream_prefix text;
        event_type text;
      BEGIN
        stream_prefix := replace(NEW.emitter, 'ms-', '');
        IF NEW.status = 'COMPLETED' THEN
          event_type := stream_prefix || ':job:outbox:success';
          INSERT INTO event_queue (type, emitter, "emitterId", payload, version, updated_at, target_services)
          VALUES (
            event_type,
            NEW.emitter,
            NEW.job_id::uuid,
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            1,
            now(),
            ARRAY[event_type]
          );
        ELSIF NEW.status = 'FAILED' THEN
          event_type := stream_prefix || ':job:outbox:failure';
          INSERT INTO event_queue (type, emitter, "emitterId", payload, version, updated_at, target_services)
          VALUES (
            event_type,
            NEW.emitter,
            NEW.job_id::uuid,
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            1,
            now(),
            ARRAY[event_type]
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_job_audit_status_change()
      RETURNS TRIGGER AS $$
      DECLARE
        stream_prefix text;
        event_type text;
      BEGIN
        stream_prefix := replace(NEW.emitter, 'ms-', '');
        IF NEW.status = 'COMPLETED' THEN
          event_type := stream_prefix || ':job:outbox:success';
          INSERT INTO event_queue (type, emitter, "emitterId", payload, version, updated_at, target_services)
          VALUES (
            event_type,
            NEW.emitter,
            NEW.job_id::uuid,
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            1,
            now(),
            ARRAY[NEW.emitter]
          );
        ELSIF NEW.status = 'FAILED' THEN
          event_type := stream_prefix || ':job:outbox:failure';
          INSERT INTO event_queue (type, emitter, "emitterId", payload, version, updated_at, target_services)
          VALUES (
            event_type,
            NEW.emitter,
            NEW.job_id::uuid,
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            1,
            now(),
            ARRAY[NEW.emitter]
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
