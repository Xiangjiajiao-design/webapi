import { Injectable } from '@nestjs/common';
import { pipe } from 'fp-ts/function';
import * as T from 'fp-ts/Task';
import * as TO from 'fp-ts/TaskOption';
import * as TE from 'fp-ts/TaskEither';
import * as A from 'fp-ts/Array';
import { Prisma, TeamEnvironment as DBTeamEnvironment } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PubSubService } from 'src/pubsub/pubsub.service';
import { TeamEnvironment } from './team-environments.model';
import {
  TEAM_ENVIRONMENT_NOT_FOUND,
  TEAM_ENVIRONMENT_SHORT_NAME,
} from 'src/errors';
import * as E from 'fp-ts/Either';
import { isValidLength, stringToJson } from 'src/utils';
@Injectable()
export class TeamEnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubService,
  ) {}

  TITLE_LENGTH = 3;

  /**
   * TeamEnvironments are saved in the DB in the following way
   * [{ key: value }, { key: value },....]
   *
   */

  /**
   * Typecast a database TeamEnvironment to a TeamEnvironment model
   * @param teamEnvironment database TeamEnvironment
   * @returns TeamEnvironment model
   */
  private cast(teamEnvironment: DBTeamEnvironment): TeamEnvironment {
    return <TeamEnvironment>{
      id: teamEnvironment.id,
      name: teamEnvironment.name,
      teamID: teamEnvironment.teamID,
      variables: JSON.stringify(teamEnvironment.variables),
    };
  }

  /**
   * Get details of a TeamEnvironment.
   *
   * @param id TeamEnvironment ID
   * @returns Either of a TeamEnvironment or error message
   */
  async getTeamEnvironment(id: string) {
    try {
      const teamEnvironment =
        await this.prisma.teamEnvironment.findFirstOrThrow({
          where: { id },
        });
      return E.right(teamEnvironment);
    } catch (error) {
      return E.left(TEAM_ENVIRONMENT_NOT_FOUND);
    }
  }

  /**
   *  Create a new TeamEnvironment.
   *
   * @param name name of new TeamEnvironment
   * @param teamID teamID of new TeamEnvironment
   * @param variables JSONified string of contents of new TeamEnvironment
   * @returns TeamEnvironment object
   */
  async createTeamEnvironment(name: string, teamID: string, variables: string) {
    const isTitleValid = isValidLength(name, this.TITLE_LENGTH);
    if (!isTitleValid) return E.left(TEAM_ENVIRONMENT_SHORT_NAME);

    const result = await this.prisma.teamEnvironment.create({
      data: {
        name: name,
        teamID: teamID,
        variables: JSON.parse(variables),
      },
    });

    const createdTeamEnvironment = this.cast(result);

    this.pubsub.publish(
      `team_environment/${createdTeamEnvironment.teamID}/created`,
      createdTeamEnvironment,
    );

    return E.right(createdTeamEnvironment);
  }

  /**
   * Delete a TeamEnvironment.
   *
   * @param id TeamEnvironment ID
   * @returns Either of boolean or error message
   */
  async deleteTeamEnvironment(id: string) {
    try {
      const result = await this.prisma.teamEnvironment.delete({
        where: {
          id: id,
        },
      });

      const deletedTeamEnvironment = this.cast(result);

      this.pubsub.publish(
        `team_environment/${deletedTeamEnvironment.teamID}/deleted`,
        deletedTeamEnvironment,
      );

      return E.right(true);
    } catch (error) {
      return E.left(TEAM_ENVIRONMENT_NOT_FOUND);
    }
  }

  /**
   * Update a TeamEnvironment.
   *
   * @param id TeamEnvironment ID
   * @param name TeamEnvironment name
   * @param variables JSONified string of contents of new TeamEnvironment
   * @returns Either of a TeamEnvironment or error message
   */
  async updateTeamEnvironment(id: string, name: string, variables: string) {
    try {
      const isTitleValid = isValidLength(name, this.TITLE_LENGTH);
      if (!isTitleValid) return E.left(TEAM_ENVIRONMENT_SHORT_NAME);

      const result = await this.prisma.teamEnvironment.update({
        where: { id: id },
        data: {
          name,
          variables: JSON.parse(variables),
        },
      });

      const updatedTeamEnvironment = this.cast(result);

      this.pubsub.publish(
        `team_environment/${updatedTeamEnvironment.teamID}/updated`,
        updatedTeamEnvironment,
      );

      return E.right(updatedTeamEnvironment);
    } catch (error) {
      return E.left(TEAM_ENVIRONMENT_NOT_FOUND);
    }
  }

  /**
   * Clear contents of a TeamEnvironment.
   *
   * @param id TeamEnvironment ID
   * @returns Either of a TeamEnvironment or error message
   */
  async deleteAllVariablesFromTeamEnvironment(id: string) {
    try {
      const result = await this.prisma.teamEnvironment.update({
        where: { id: id },
        data: {
          variables: [],
        },
      });

      const teamEnvironment = this.cast(result);

      this.pubsub.publish(
        `team_environment/${teamEnvironment.teamID}/updated`,
        teamEnvironment,
      );

      return E.right(teamEnvironment);
    } catch (error) {
      return E.left(TEAM_ENVIRONMENT_NOT_FOUND);
    }
  }

  /**
   * Create a duplicate of a existing TeamEnvironment.
   *
   * @param id TeamEnvironment ID
   * @returns Either of a TeamEnvironment or error message
   */
  async createDuplicateEnvironment(id: string) {
    try {
      const result = await this.prisma.teamEnvironment.findFirst({
        where: {
          id: id,
        },
        rejectOnNotFound: true,
      });

      const duplicatedTeamEnvironment = this.cast(result);

      this.pubsub.publish(
        `team_environment/${duplicatedTeamEnvironment.teamID}/created`,
        duplicatedTeamEnvironment,
      );

      return E.right(duplicatedTeamEnvironment);
    } catch (error) {
      return E.left(TEAM_ENVIRONMENT_NOT_FOUND);
    }
  }

  /**
   * Fetch all TeamEnvironments of a team.
   *
   * @param teamID teamID of new TeamEnvironment
   * @returns List of TeamEnvironments
   */
  async fetchAllTeamEnvironments(teamID: string) {
    const result = await this.prisma.teamEnvironment.findMany({
      where: {
        teamID: teamID,
      },
    });
    const teamEnvironments = result.map((item) => {
      return this.cast(item);
    });

    return teamEnvironments;
  }

  /**
   * Fetch the count of environments for a given team.
   * @param teamID team id
   * @returns a count of team envs
   */
  async totalEnvsInTeam(teamID: string) {
    const envCount = await this.prisma.teamEnvironment.count({
      where: {
        teamID: teamID,
      },
    });
    return envCount;
  }
}
