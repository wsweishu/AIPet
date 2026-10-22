import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { PetClaimResponse } from '@shared/api.interface';

export async function claimPet(): Promise<PetClaimResponse> {
  try {
    const response = await axiosForBackend({ url: '/api/pet/claim', method: 'POST' });
    return response.data as PetClaimResponse;
  } catch (error) {
    logger.error('领取肥鱼失败', error);
    throw error;
  }
}


// Add more API functions here, use axios instance (`axiosForBackend`) to make requests.
// 
// 使用示例：
// export async function getUserData(userId: string) {
//   try {
//     const response = await axiosForBackend({
//       url: `/api/users/${userId}`,
//       method: 'GET'
//     });
//     return response.data;
//   } catch (error) {
//     logger.error('获取用户数据失败', error);
//     throw error;
//   }
// }
