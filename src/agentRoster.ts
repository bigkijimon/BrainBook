// Who each agent is, in words the owner can read (owner 2026-09-30: "click an agent and
// explain what it actually does"; "name each agent after a person famous in that field";
// "write the LLM model under the name"). The internal id (`name` everywhere else in
// BrainBook, the Kanban assignee, the Router worker) never changes — only the display does.
// The model is NOT written here: it comes live from /api/agents/teams (agent-feed.py
// member_models), which reads each profile's config, so it follows any config change.

export type RosterEntry = {
  persona: string;       // famous person in that field, shown as the agent's name
  field: string;         // why that person: what they are known for
  does: string;          // what this agent really does here, one or two plain sentences
  gives?: string;        // what it hands back
  instruct?: string;     // how the owner reaches it
};

export const ROSTER: Record<string, RosterEntry> = {
  Bigkiji: { persona: 'Bigkiji', field: 'Chief orchestrator', does: 'Takes your request from Telegram, the terminal or BrainBook, decides which team owns it, hands it over and reports back to you.', gives: 'One report per finished request.', instruct: 'Talk to it in the terminal, Telegram or BrainBook.' },
  Router: { persona: 'Vint Cerf', field: 'Co-designer of TCP/IP, "father of the internet"', does: 'Reads each engineering task and sends it to the cheapest worker that can do it well: MiMo first, Claude Code for QA, debugging or difficult work.', gives: 'A job receipt: who did it and whether the checks passed.' },
  MiMo: { persona: 'Linus Torvalds', field: 'Creator of Linux and Git', does: 'Writes and repairs code for every team. It is the free default builder.', gives: 'A code change for Pi to check.' },
  'Space Bunny': { persona: 'Jony Ive', field: 'Designer of the iMac and iPhone', does: 'Builds and polishes user interfaces: layouts, spacing and styling.', gives: 'A UI change for Pi to check.' },
  'Claude Code': { persona: 'Grace Hopper', field: 'Computing pioneer who popularised "debugging"', does: 'For every bug card, and again before every repair round, it first reproduces the failure and proves one root cause (debug, read-only). The builder fixes that cause. Then it runs QA and re-runs the reproduction, so a surface-only fix fails. It also takes the difficult tasks.', gives: 'A diagnosis (reproduction, root cause, verify command), then a QA verdict (PASS/FAIL with reasons).' },
  'Qwen (local)': { persona: 'Ada Lovelace', field: 'Wrote the first computer program', does: 'The large model that runs on this Mac. It is used for long, private jobs that must not leave the machine.', gives: 'Text results. It shares the GPU, so it pauses while videos render.' },
  Vision: { persona: 'Fei-Fei Li', field: 'Created ImageNet, a leader in computer vision', does: 'Looks at images and video frames and says what is really in them: faces, clothes and objects.', gives: 'A description Auto QA and reviewers compare with the script.' },
  Pi: { persona: 'Margaret Hamilton', field: 'Led the Apollo flight software', does: 'Before a build, it gathers the relevant files into a short brief. After the build, it runs the team\'s checks. It uses no AI model, only scripts.', gives: 'A brief for the builder and a check report for QA.' },
  Jev: { persona: 'Daniel Kahneman', field: 'Nobel prize for the psychology of decisions', does: 'Advises Bigkiji on which Claude lane to use, and whether to retry or escalate after a failed check. It gives advice only and never decides.', gives: 'A recommendation with a confidence score.' },
  Tora: { persona: 'Edsger Dijkstra', field: 'Pioneer of rigorous programming', does: 'Reproduces a failure and narrows it down to one proven cause. It diagnoses only; it does not repair.', gives: 'The cause with evidence.' },
  Hana: { persona: 'Benjamin Bloom', field: 'Bloom\'s taxonomy of learning', does: 'Checks worksheets, textbooks and PDFs as images: correct answers, pictures that match the text, and layout.', gives: 'A list of problems on each page.' },
  // MoviePro · Film Group
  Steve: { persona: 'Steven Spielberg', field: 'Film director', does: 'Directs the lesson-video production: script, keyframes, video, checks and the final unit. It owns the movie-pro chain.', gives: 'Finished lesson videos after QA.', instruct: 'Direct instruction from the MoviePro sheet.' },
  HideoKojima: { persona: 'Hideo Kojima', field: 'Game director and storyteller', does: 'Writes the scenario and the world of each lesson: scenes, characters and what happens in each cut. It works as a department under Steve.', gives: 'The scene plan for each cut.' },
  'RyūichiSakamoto': { persona: 'Ryūichi Sakamoto', field: 'Composer', does: 'Plans the audio: voices, music and sound for each unit. It works as a department under Steve.', gives: 'The audio plan and the sign-off.' },
  Kuro: { persona: 'Roger Ebert', field: 'Film critic', does: 'Reviews finished frames and character sheets with fresh eyes, separately from the team that made them.', gives: 'PASS or FAIL with what is wrong.', instruct: 'Direct instruction from the MoviePro sheet.' },
  Shimajiro: { persona: 'Sal Khan', field: 'Founder of Khan Academy', does: 'Turns the teaching goal into a short brief: which words, which level, and what the child should be able to say at the end.', gives: 'The education brief Steve builds from.', instruct: 'Direct instruction from the MoviePro sheet.' },
  Ame: { persona: 'Maria Montessori', field: 'Educator and education researcher', does: 'Researches how children learn the target language and checks that the lesson fits their age.', gives: 'Research notes for Shimajiro.', instruct: 'Direct instruction from the MoviePro sheet.' },
  Maru: { persona: 'Jensen Huang', field: 'Founder of NVIDIA', does: 'Runs the GPU: takes the lease, starts ComfyUI, watches memory, and gives the machine back when the job ends.', gives: 'Rendered files, or a clear "blocked" reason (for example, not enough memory).', instruct: 'Direct instruction from the MoviePro sheet.' },
  'Auto QA': { persona: 'Thelma Schoonmaker', field: 'Film editor (Raging Bull, Goodfellas)', does: 'Checks every cut automatically: it listens with Whisper, looks with Vision, compares both with the script and holds any cut that does not match.', gives: 'A PASS or FAIL for each cut and for the whole unit.' },
  ComfyUI: { persona: 'Hayao Miyazaki', field: 'Animation director', does: 'The image and video engine. It draws the keyframes and animates them into video on the GPU.', gives: 'Keyframe images and MP4 cuts.' },
  // BlogPro
  Sora: { persona: 'Seth Godin', field: 'Marketer and daily blogger', does: 'Leads blogs, social media and the AI influencer. Nothing is published without your approval.', gives: 'Drafts waiting in the approval queue.', instruct: 'Direct instruction from the BlogPro sheet.' },
  Coco: { persona: 'MrBeast', field: 'The most-subscribed YouTube creator', does: 'The AI influencer persona: plans and drafts short social posts and stills.', gives: 'Post drafts for Sora.' },
  'Blog QA': { persona: 'William Zinsser', field: 'Author of "On Writing Well"', does: 'Scores H&S blog drafts against the 95-point gate: facts, clarity and tone.', gives: 'A score with the lines to fix.' },
  'Tech Blog QA': { persona: 'Donald Knuth', field: 'Author of "The Art of Computer Programming"', does: 'Scores technical blog drafts against the 95-point gate. It checks that the code and claims are correct.', gives: 'A score with the lines to fix.' },
};

export const personaOf = (name: string) => ROSTER[name]?.persona || name;
