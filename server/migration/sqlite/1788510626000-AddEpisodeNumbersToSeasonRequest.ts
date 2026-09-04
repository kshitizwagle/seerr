import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEpisodeNumbersToSeasonRequest1788510626000 implements MigrationInterface {
  name = 'AddEpisodeNumbersToSeasonRequest1788510626000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "season_request" ADD "episodeNumbers" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "season_request" DROP COLUMN "episodeNumbers"`
    );
  }
}
