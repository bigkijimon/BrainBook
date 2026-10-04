// Test-only page for scripts/test-evolution-ui.mjs: the real left-rail TeamRail with an InvestPro team
// (which gains the EVOLUTION tab) and an App Dev team (which must not). The test mocks
// /api/investment/evolution with the real sanitizer's output, so no server, broker or model is involved.
import { createRoot } from 'react-dom/client';
import { TeamRail } from '../../src/TeamRail';
import '../../src/styles.css';

const members = (names: string[]) => names.map((name, index) => ({ name, role: 'role', live: false, parent: index ? names[0] : null, model: null }));
const teams = [
  { id: 'investment', name: 'InvestPro', label: 'Investment', live: false, specialists: [], work: [], direct: ['Bigkiji', 'Daniel Kahneman'],
    members: members(['Bigkiji', 'Margaret Hamilton', 'Linus Torvalds', 'Jony Ive', 'Grace Hopper', 'Daniel Kahneman']) },
  { id: 'app-dev', name: 'App Dev', label: 'App Development', live: false, specialists: [], work: [], direct: ['Bigkiji', 'MiMo'], members: members(['Bigkiji', 'MiMo']) },
];

createRoot(document.getElementById('root')!).render(<TeamRail teams={teams} allCount={0} onAll={() => {}} allActive={false} />);
