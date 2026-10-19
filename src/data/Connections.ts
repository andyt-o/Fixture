// ==============================================================================
// Imports
// ==============================================================================
import discordIcon    from "../assets/icons/Discord.svg?raw";
import slackIcon      from "../assets/icons/Slack.svg?raw";
import teamsIcon      from "../assets/icons/MicrosoftTeams.svg?raw";
import jiraIcon       from "../assets/icons/Jira.svg?raw";
import robotIcon      from "../assets/icons/Robot.svg?raw";
import codeEditorIcon from "../assets/icons/CodeEditor.svg?raw";
import webIcon        from "../assets/icons/Web.svg?raw";
import emailIcon      from "../assets/icons/Email.svg?raw";

// ==============================================================================
// Types
// ==============================================================================
export interface ConnectionRow {
  kind:  string;
  label: string;
  icon:  string;
}

// ==============================================================================
// Constants
// ==============================================================================
export const CONNECTION_ROWS: ConnectionRow[] = [
  { kind: "discord",   label: "Discord",     icon: discordIcon    },
  { kind: "slack",     label: "Slack",       icon: slackIcon      },
  { kind: "teams",     label: "Teams",       icon: teamsIcon      },
  { kind: "jira",      label: "Jira",        icon: jiraIcon       },
  { kind: "api-token", label: "API / Agent", icon: robotIcon      },
  { kind: "ide",       label: "Code Editor", icon: codeEditorIcon },
  { kind: "browser",   label: "Browser",     icon: webIcon        },
  { kind: "email",     label: "Email",       icon: emailIcon      },
];
