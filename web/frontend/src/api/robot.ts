import type { RobotClient } from '@viamrobotics/sdk';
import { robotApi } from '@viamrobotics/sdk';

// TODO: Replace this with a direct RobotClient call if/when getSessions is exposed in the SDK
export const getSessions = async (robotClient: RobotClient) => {
  const request = new robotApi.GetSessionsRequest();

  const response = await new Promise<robotApi.GetSessionsResponse | null>(
    (resolve, reject) => {
      robotClient.robotService.getSessions(request, (error, res) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(res);
      });
    }
  );

  return response?.toObject().sessionsList ?? [];
};
