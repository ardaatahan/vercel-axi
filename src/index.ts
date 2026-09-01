import { dispatch, type Registry } from "./cli/router.js";
import { homeCommand, rootHelp } from "./commands/home.js";
import {
  deploymentDeploy,
  deploymentInspect,
  deploymentList,
  deploymentLogs,
  deploymentPromote,
  deploymentRollback,
  dnsAdd,
  dnsInspect,
  dnsList,
  dnsRemove,
  domainAdd,
  domainInspect,
  domainList,
  domainRemove,
  envAdd,
  envList,
  envRemove,
  projectCreate,
  projectLink,
  projectList,
  teamList,
  teamSwitch,
} from "./commands/vercel.js";

const registry: Registry = {
  tool: "vercel-axi",
  root: homeCommand,
  rootHelp,
  commands: {
    "deployment list": deploymentList,
    "deployment inspect": deploymentInspect,
    "deployment logs": deploymentLogs,
    "deployment deploy": deploymentDeploy,
    "deployment promote": deploymentPromote,
    "deployment rollback": deploymentRollback,
    "project list": projectList,
    "project create": projectCreate,
    "project link": projectLink,
    "domain list": domainList,
    "domain inspect": domainInspect,
    "domain add": domainAdd,
    "domain remove": domainRemove,
    "dns list": dnsList,
    "dns inspect": dnsInspect,
    "dns add": dnsAdd,
    "dns remove": dnsRemove,
    "env list": envList,
    "env add": envAdd,
    "env remove": envRemove,
    "team list": teamList,
    "team switch": teamSwitch,
  },
  aliases: {
    "env rm": "env remove",
  },
};

const code = await dispatch(registry, process.argv.slice(2));
process.exit(code);
