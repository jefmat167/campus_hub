import { Global, Module } from '@nestjs/common';
import { TimingPolicyService } from '../services/timing-policy.service';

@Global()
@Module({
  providers: [TimingPolicyService],
  exports: [TimingPolicyService],
})
export class TimingPolicyModule {}
