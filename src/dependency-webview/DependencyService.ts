import { ISCClient } from '../services/ISCClient';
import type { DependencyEdgeData, DependencyGraphData, DependencyNodeData } from './app/src/services/Client';

export const SOURCE_CLOUD_RULE_FIELDS = [
    { key: "beforeProvisioningRule", label: "before provisioning rule" },
    { key: "accountCorrelationRule", label: "correlation rule" },
    { key: "managerCorrelationRule", label: "manager correlation rule" },
] as const;

export abstract class DependencyService {

    protected nodes: DependencyNodeData[];
    protected edges: DependencyEdgeData[] = [];
    protected client: ISCClient;
    public static readonly rootId = "root";
    private readonly nodeIds: Set<string>;

    constructor(
        protected readonly tenantId: string,
        protected readonly tenantName: string,
        protected readonly tenantDisplayname: string,
        protected readonly resourceType: string,
        protected readonly resourceId: string,
        protected readonly resourceName: string,
        protected readonly label: string
    ) {
        this.nodes = [
            { id: DependencyService.rootId, type: resourceType, label, resourceId }
        ];
        this.nodeIds = new Set([DependencyService.rootId]);
        this.client = new ISCClient(tenantId, tenantName)
    }

    /**
     * Adds a node unless one with the same id was already added. Several traversal paths
     * (e.g. the same source reached through different identity attributes) can reference the
     * same underlying object, and the graph should only contain one node for it.
     */
    protected addNodeOnce(node: DependencyNodeData): void {
        if (this.nodeIds.has(node.id)) {
            return;
        }
        this.nodeIds.add(node.id);
        this.nodes.push(node);
    }

    /**
     * Collects the distinct source names pulled from by "accountAttribute" transforms nested
     * anywhere inside the given transform definition (e.g. inside a composite transform).
     */
    protected collectReferencedSourceNames(transformDefinition: any): string[] {
        const names = new Set<string>();
        this.walkTransformDefinition(transformDefinition, t => {
            if (t.type === "accountAttribute" && typeof t.attributes?.sourceName === "string") {
                names.add(t.attributes.sourceName);
            }
        });
        return Array.from(names);
    }

    /**
     * Collects the distinct named transforms ("reference" transforms) used anywhere inside the
     * given transform definition (e.g. inside a composite transform).
     */
    protected collectReferencedTransformNames(transformDefinition: any): string[] {
        const names = new Set<string>();
        this.walkTransformDefinition(transformDefinition, t => {
            if (t.type === "reference" && typeof t.attributes?.id === "string") {
                names.add(t.attributes.id);
            }
        });
        return Array.from(names);
    }

    protected collectReferencedCloudRuleRefs(transformDefinition: any): { name?: string; id?: string }[] {
        const refs: { name?: string; id?: string }[] = [];
        this.walkTransformDefinition(transformDefinition, t => {
            if (t.type === "rule") {
                refs.push({
                    name: t.attributes?.name ?? t.attributes?.ruleName,
                    id: t.attributes?.id,
                });
            }
        });
        return refs;
    }

    protected ruleRefMatchesSourceField(ref: any, ruleName: string, ruleId: string): boolean {
        if (!ref || typeof ref !== "object") {
            return false;
        }
        const type = typeof ref.type === "string" ? ref.type.toUpperCase() : "";
        if (type !== "RULE") {
            return false;
        }
        return ref.id === ruleId || ref.name === ruleName;
    }

    protected getSourceCloudRuleRef(ref: any): { id: string; name: string } | undefined {
        if (!ref || typeof ref !== "object") {
            return undefined;
        }
        const type = typeof ref.type === "string" ? ref.type.toUpperCase() : "";
        if (type !== "RULE") {
            return undefined;
        }
        const id = ref.id ?? ref.name;
        const name = ref.name ?? ref.id;
        if (!id || !name) {
            return undefined;
        }
        return { id, name };
    }

    protected transformReferencesRule(transform: any, ruleName: string, ruleId: string): boolean {
        if (!transform || typeof transform !== "object") {
            return false;
        }
        if (transform.type === "rule") {
            const name = transform.attributes?.name ?? transform.attributes?.ruleName;
            const id = transform.attributes?.id;
            if (name === ruleName || id === ruleId) {
                return true;
            }
        }
        return Object.values(transform.attributes ?? {}).some((value: any) =>
            Array.isArray(value)
                ? value.some((v: any) => this.transformReferencesRule(v, ruleName, ruleId))
                : this.transformReferencesRule(value, ruleName, ruleId));
    }

    protected collectConnectorRuleAttachments(
        attrs: any,
        knownNames: Set<string>
    ): { ruleName: string; edgeLabel: string }[] {
        const attachments: { ruleName: string; edgeLabel: string }[] = [];
        const seen = new Set<string>();

        const add = (ruleName: string, edgeLabel: string): void => {
            if (!knownNames.has(ruleName)) {
                return;
            }
            const key = `${ruleName}\0${edgeLabel}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            attachments.push({ ruleName, edgeLabel });
        };

        if (Array.isArray(attrs?.connectionParameters)) {
            for (const param of attrs.connectionParameters) {
                const configName = param?.uniqueNameForEndPoint ?? param?.label ?? param?.name ?? param?.operationType ?? "HTTP operation";
                for (const ruleKey of ["beforeRule", "afterRule"] as const) {
                    const ruleName = param?.[ruleKey];
                    if (typeof ruleName === "string") {
                        add(ruleName, `${ruleKey} · ${configName}`);
                    }
                }
            }
        }

        const walk = (value: any, context: string): void => {
            if (value === attrs?.connectionParameters) {
                return;
            }
            if (typeof value === "string") {
                add(value, context || "connector rule");
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(v => walk(v, context));
                return;
            }
            if (value && typeof value === "object") {
                for (const [k, v] of Object.entries(value)) {
                    if (k === "connectionParameters") {
                        continue;
                    }
                    walk(v, k.toLowerCase().includes("rule") ? k : context);
                }
            }
        };
        walk(attrs, "");

        return attachments;
    }

    protected addRuleNode(
        nodeType: "cloud-rule" | "connector-rule",
        id: string,
        name: string,
        data: unknown,
        parentId: string,
        attachment: string,
        noGroup = false,
        options?: { graphNodeId?: string }
    ): void {
        const graphNodeId = options?.graphNodeId ?? id;
        this.addNodeOnce({
            id: graphNodeId,
            type: nodeType,
            label: name,
            resourceId: id,
            attributes: { attachment },
            data,
        });
        const edgeIdSuffix = attachment.replace(/[^a-zA-Z0-9]+/g, "_") || graphNodeId;
        this.edges.push({
            id: `${parentId}-${graphNodeId}-${edgeIdSuffix}`,
            source: parentId,
            target: graphNodeId,
            noGroup,
        });
    }

    protected addCloudRulesFromTransform(
        transformDefinition: any,
        parentId: string,
        attachment: string,
        options?: { noGroup?: boolean }
    ): void {
        for (const ref of this.collectReferencedCloudRuleRefs(transformDefinition)) {
            const id = ref.id ?? ref.name;
            const name = ref.name ?? ref.id;
            if (!id || !name) {
                continue;
            }
            this.addRuleNode("cloud-rule", id, name, ref, parentId, attachment, options?.noGroup ?? true);
        }
    }

    protected walkTransformDefinition(transform: any, visit: (transform: any) => void): void {
        if (!transform || typeof transform !== "object") {
            return;
        }
        visit(transform);
        for (const value of Object.values(transform.attributes ?? {})) {
            if (Array.isArray(value)) {
                value.forEach((v: any) => this.walkTransformDefinition(v, visit));
            } else {
                this.walkTransformDefinition(value, visit);
            }
        }
    }

    abstract getDependencyGraph(): Promise<DependencyGraphData>;
}
