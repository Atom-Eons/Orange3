export const ORANGEBOX_PUBLIC_NAME = "Orangebox Version 1";

export const FIRST_RUN_INSTALL_CHOICES = [
  {
    id: "basic",
    label: "No - Basic install",
    title: "Basic Install",
    recommended: true,
    summary: "Run Orangebox Version 1 on one computer.",
    detail: "No second box, no network setup, no admin networking prompts. Most people should pick No.",
  },
  {
    id: "advanced-ai-box",
    label: "Yes - Advanced AI Box",
    title: "Advanced AI Box",
    recommended: false,
    summary: "Use this computer as the controller for a second AI computer.",
    detail: "Advanced AI Box can use a second AI computer over Thunderbolt or Ethereal Ethernet when the hardware exists.",
  },
];

export const FIRST_RUN_HELP = {
  question: "Do you have an AI computer to set up?",
  buyingHelpTitle: "What is an AI computer and where can I buy one?",
  buyingHelp:
    "An AI computer can be a capable local machine such as mini PCs, creator PCs, gaming PCs, or workstations. Orangebox Version 1 does not require one; Basic Install keeps Orangebox Version 1 useful on this computer first.",
};

export function getFirstRunInstallContract() {
  return {
    publicName: ORANGEBOX_PUBLIC_NAME,
    defaultChoice: "basic",
    question: FIRST_RUN_HELP.question,
    choices: FIRST_RUN_INSTALL_CHOICES,
    help: FIRST_RUN_HELP,
    recoveryRule:
      "Basic Install is always the fallback. Advanced AI Box is optional and never blocks local Orangebox Version 1 operations.",
  };
}
