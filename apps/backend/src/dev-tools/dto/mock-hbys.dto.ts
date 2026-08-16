import { IsIn } from 'class-validator';
import { MOCK_HBYS_MODES, type MockHbysMode } from '../../integrations/hbys/mock-hbys.adapter';

/** `PUT /dev-tools/mock-hbys` (docs/API_CONTRACT.md section 98). */
export class SetMockHbysModeDto {
  @IsIn(MOCK_HBYS_MODES, { message: 'mode must be SUCCESS, FAIL or TIMEOUT.' })
  mode: MockHbysMode;
}
