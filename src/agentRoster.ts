// Who each agent is, in words the owner can read (owner 2026-09-30: "click an agent and
// explain what it actually does"; "name each agent after a person famous in that field";
// "write the LLM model under the name"). The internal id (`name` everywhere else in
// BrainBook, the Kanban assignee, the Router worker) never changes — only the display does.
// The model is NOT written here: it comes live from /api/agents/teams (agent-feed.py
// member_models), which reads each member's own config — a Hermes profile for the film crew, the
// Router's workers.yaml and adapters for MiMo and Space Bunny — so it follows any config change.

export type RosterEntry = {
  persona: string;       // famous person in that field, shown as the agent's name
  field: string;         // why that person: what they are known for
  does: string;          // what this agent really does here, one or two plain sentences
  gives?: string;        // what it hands back
  instruct?: string;     // how the owner reaches it
};

export const ROSTER: Record<string, RosterEntry> = {
  Bigkiji: { persona: 'Bigkiji', field: 'Chief coordinator', does: 'Takes your request from Telegram, the terminal or BrainBook, decides which team owns it, hands it over and reports back to you.', gives: 'One report per finished request.', instruct: 'Talk to it in the terminal, Telegram or BrainBook.' },
  Router: { persona: 'APPTeamTop', field: 'Engineering team lead that routes each task', does: 'Reads each engineering task and sends it to the cheapest worker that can do it well: MiMo first, Claude Code for quality checks, debugging or difficult work.', gives: 'A job receipt: who did it and whether the checks passed.' },
  MiMo: { persona: 'Linus Torvalds', field: 'Creator of Linux', does: 'Writes and repairs code for every team. On MovieAgent it builds and repairs the lesson scripts. It is the free default builder.', gives: 'A code change for Pi to check, or a rewritten script for MovieAgent.' },
  'Space Bunny': { persona: 'Grace Hopper', field: 'Pioneer of programming languages', does: 'Builds and polishes user interfaces: layouts, spacing and styling. On MovieAgent it checks a finished script against the lesson goal.', gives: 'A UI change for Pi to check, or a script check for MovieAgent.' },
  'Claude Code': { persona: 'GraceHopper_High', field: 'Finds the root cause of a failure', does: 'For every bug card, and again before every repair round, it first reproduces the failure and proves one root cause (debug, read-only). The builder fixes that cause. Then it runs quality checks and re-runs the reproduction, so a surface-only fix fails. It also takes the difficult tasks.', gives: 'A diagnosis (reproduction, root cause, verify command), then a quality-check verdict (PASS/FAIL with reasons).' },
  'Qwen (local)': { persona: 'Ada Lovelace', field: 'Wrote the first computer program', does: 'The large model that runs on this Mac. It is used for long, private jobs that must not leave the machine.', gives: 'Text results. It shares the GPU, so it pauses while videos render.' },
  Vision: { persona: 'Watcher', field: 'Reads what is in an image or a video frame', does: 'Looks at images and video frames and says what is really in them: faces, clothes and objects.', gives: 'A description Auto QA and reviewers compare with the script.' },
  Pi: { persona: 'Margaret Hamilton', field: 'Led the Apollo flight software', does: 'Before a build, it gathers the relevant files into a short brief. After the build, it runs the team\'s checks. It uses no AI model, only scripts.', gives: 'A brief for the builder and a check report for QA.' },
  Jev: { persona: 'Daniel Kahneman', field: 'Nobel prize for the psychology of decisions', does: 'Advises Bigkiji at three decision points: how urgent a new task is, which lane should take it, and whether a failed check is retried free or held for you. Its answers are accepted only with evidence and confidence; anything else is sent back and a plain local rule decides. It never picks a worker, approves anything or spends.', gives: 'A recommendation with a confidence score, or the reason it was sent back.' },
  Tora: { persona: 'Edsger Dijkstra', field: 'Pioneer of rigorous programming', does: 'Reproduces a failure and narrows it down to one proven cause. It diagnoses only; it does not repair.', gives: 'The cause with evidence.' },
  Hana: { persona: 'Benjamin Bloom', field: 'Bloom\'s taxonomy of learning', does: 'Checks worksheets, textbooks and PDFs as images: correct answers, pictures that match the text, and layout.', gives: 'A list of problems on each page.' },
  // MoviePro (owner 2026-10-02: one team — the film crew below plus the script lane in MiMo /
  // Space Bunny above, so there is no second department to name here)
  // Owner 2026-10-19: the department Top display name is now MovieAgent (persona label, not
  // the internal id/seat key `Steve`/`MovieProTop-Mame`, which are unchanged).
  Steve: { persona: 'MovieAgent', field: 'Film director', does: 'Directs the lesson-video production on MovieAgent: education brief, scenario, audio, the script the team builds and checks, keyframes, video, checks and the final unit. Everything on that line is this one team.', gives: 'Finished lesson videos after quality checks.', instruct: 'Direct instruction from the MovieAgent sheet.' },
  HideoKojima: { persona: 'Hideo Kojima', field: 'Game director and storyteller', does: 'Writes the scenario and the world of each lesson: scenes, characters and what happens in each cut. It works as a department under MovieAgent.', gives: 'The scene plan for each cut.' },
  'RyūichiSakamoto': { persona: 'Ryūichi Sakamoto', field: 'Composer', does: 'Plans the audio: voices, music and sound for each unit. It works as a department under MovieAgent.', gives: 'The audio plan and the sign-off.' },
  Kuro: { persona: 'Roger Ebert', field: 'Film critic', does: 'Reviews finished frames and character sheets with fresh eyes, separately from the team that made them.', gives: 'PASS or FAIL with what is wrong.', instruct: 'Direct instruction from the MovieAgent sheet.' },
  Shimajiro: { persona: 'Sal Khan', field: 'Founder of Khan Academy', does: 'Turns the teaching goal into a short brief: which words, which level, and what the child should be able to say at the end.', gives: 'The education brief MovieAgent builds from.', instruct: 'Direct instruction from the MovieAgent sheet.' },
  Ame: { persona: 'Maria Montessori', field: 'Educator and education researcher', does: 'Researches how children learn the target language and checks that the lesson fits their age.', gives: 'Research notes for Shimajiro.', instruct: 'Direct instruction from the MovieAgent sheet.' },
  Maru: { persona: 'Jensen Huang', field: 'Founder of NVIDIA', does: 'Runs the GPU: takes the lease, starts ComfyUI, watches memory, and gives the machine back when the job ends.', gives: 'Rendered files, or a clear "blocked" reason (for example, not enough memory).', instruct: 'Direct instruction from the MovieAgent sheet.' },
  'Auto QA': { persona: 'Thelma Schoonmaker', field: 'Film editor (Raging Bull, Goodfellas)', does: 'Checks every cut automatically: it listens with Whisper, looks with Vision, compares both with the script and holds any cut that does not match.', gives: 'A PASS or FAIL for each cut and for the whole unit.' },
  ComfyUI: { persona: 'Hayao Miyazaki', field: 'Animation director', does: 'The image and video engine. It draws the keyframes and animates them into video on the GPU.', gives: 'Keyframe images and MP4 cuts.' },
  // CreativePro (owner 2026-10-17: BlogPro renamed, MarketPro merged in as the Marketing team)
  'CreativeProTop-Momo': { persona: 'Seth Godin', field: 'Marketer and daily blogger', does: 'Leads the CreativePro department: owned content, blogs, social media and the AI influencer, and supervises the Marketing team. Nothing is published without your approval.', gives: 'Drafts waiting in the approval queue.', instruct: 'Direct instruction from the CreativePro sheet.' },
  Coco: { persona: 'MrBeast', field: 'The most-subscribed YouTube creator', does: 'The AI influencer persona: plans and drafts short social posts and stills.', gives: 'Post drafts for CreativeProTop-Momo.' },
  'Blog QA': { persona: 'William Zinsser', field: 'Author of "On Writing Well"', does: 'Scores H&S blog drafts against the 95-point gate: facts, clarity and tone.', gives: 'A score with the lines to fix.' },
  'Tech Blog QA': { persona: 'Donald Knuth', field: 'Author of "The Art of Computer Programming"', does: 'Scores technical blog drafts against the 95-point gate. It checks that the code and claims are correct.', gives: 'A score with the lines to fix.' },
};

export const personaOf = (name: string) => ROSTER[name]?.persona || name;
