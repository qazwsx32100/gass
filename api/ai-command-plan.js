import {callAiWithFailover} from './_ai-rotator.js';
import {fetchAppState} from './_auth.js';
import {buildMonthlyFinance} from './_ai-monthly-finance.js';
import {makeCommandHandler} from './_ai-command-bridge.js';
export default makeCommandHandler(callAiWithFailover,process.env,async(period,now)=>buildMonthlyFinance(await fetchAppState(),period,now));
