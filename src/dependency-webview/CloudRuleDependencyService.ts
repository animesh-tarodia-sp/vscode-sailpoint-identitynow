import { ExportPayloadBetaIncludeTypesBeta, ExportPayloadV2025IncludeTypesV2025, SpConfigExportResultsBeta } from 'sailpoint-api-client';
import { SimpleSPConfigExporter } from '../commands/spconfig-export/SimpleSPConfigExporter';
import type { DependencyGraphData } from './app/src/services/Client';
import { DependencyService, SOURCE_CLOUD_RULE_FIELDS } from './DependencyService';

export class CloudRuleDependencyService extends DependencyService {

    constructor(
        tenantId: string,
        tenantName: string,
        tenantDisplayname: string,
        resourceType: string,
        resourceId: string,
        resourceName: string,
        label: string
    ) {
        super(
            tenantId,
            tenantName,
            tenantDisplayname,
            resourceType,
            resourceId,
            resourceName,
            label
        )
    }

    async getDependencyGraph(): Promise<DependencyGraphData> {
        const exporter = new SimpleSPConfigExporter(
            this.client,
            this.tenantDisplayname,
            {},
            [
                ExportPayloadV2025IncludeTypesV2025.Transform,
                ExportPayloadV2025IncludeTypesV2025.IdentityProfile,
                ExportPayloadV2025IncludeTypesV2025.Source,
                ExportPayloadBetaIncludeTypesBeta.Rule,
            ]
        )

        const data = await exporter.exportConfigWithProgression();
        this.filterTransform(data);
        this.filterIdentityProfile(data);
        this.filterSource(data);

        return {
            rootId: DependencyService.rootId,
            nodes: this.nodes,
            edges: this.edges
        };
    }

    private filterTransform(data: SpConfigExportResultsBeta | null) {

        const transforms = (data?.objects ?? []).filter(o => o.self?.type === "TRANSFORM");

        for (const transformObject of transforms) {
            const transform = transformObject.object;
            if (!transform || !this.transformReferencesRule(transform, this.resourceName, this.resourceId)) {
                continue;
            }

            this.addNodeOnce({
                id: transform.id,
                type: "transform",
                label: transform.name,
                resourceId: transform.id,
                attributes: {
                    type: transform.type
                },
                data: transform
            });

            this.edges.push({
                id: `${DependencyService.rootId}-${transform.id}`,
                source: DependencyService.rootId,
                target: transform.id,
                label: "rule transform"
            });
        }
    }

    private filterIdentityProfile(data: SpConfigExportResultsBeta | null) {

        const profiles = (data?.objects ?? []).filter(o => o.self?.type === "IDENTITY_PROFILE");
        const sources = (data?.objects ?? []).filter(o => o.self?.type === "SOURCE");

        for (const profileObject of profiles) {
            const profile = profileObject.object;
            const matchingTransforms = (profile?.identityAttributeConfig?.attributeTransforms ?? [])
                .filter((at: any) => this.transformReferencesRule(at.transformDefinition, this.resourceName, this.resourceId));
            if (!profile || matchingTransforms.length === 0) {
                continue;
            }

            this.addNodeOnce({
                id: profile.id,
                type: "identity-profile",
                label: profile.name,
                description: profile.description ?? undefined,
                resourceId: profile.id,
                data: profile
            });

            this.edges.push({
                id: `${DependencyService.rootId}-${profile.id}`,
                source: DependencyService.rootId,
                target: profile.id,
                label: "rule mapping"
            });

            for (const attributeTransform of matchingTransforms) {
                const attributeNodeId = `${profile.id}::${attributeTransform.identityAttributeName}`;

                this.addNodeOnce({
                    id: attributeNodeId,
                    type: "identity-attribute",
                    label: attributeTransform.identityAttributeName,
                    resourceId: attributeTransform.identityAttributeName,
                    data: attributeTransform
                });

                this.edges.push({
                    id: `${profile.id}-${attributeNodeId}`,
                    source: profile.id,
                    target: attributeNodeId
                });

                const sourceNames = this.collectReferencedSourceNames(attributeTransform.transformDefinition);
                for (const sourceName of sourceNames) {
                    const source = sources.find(o => o.object?.name === sourceName)?.object;
                    if (!source) {
                        continue;
                    }

                    this.addNodeOnce({
                        id: source.id,
                        type: "source",
                        label: source.name,
                        description: source.description ?? undefined,
                        resourceId: source.id,
                        data: source
                    });

                    this.edges.push({
                        id: `${attributeNodeId}-${source.id}`,
                        source: attributeNodeId,
                        target: source.id,
                        label: "account attribute",
                        noGroup: true
                    });
                }
            }
        }
    }

    private filterSource(data: SpConfigExportResultsBeta | null) {

        const sources = (data?.objects ?? []).filter(o => o.self?.type === "SOURCE");

        for (const sourceObject of sources) {
            const source = sourceObject.object;
            if (!source) {
                continue;
            }

            const fieldMatches = SOURCE_CLOUD_RULE_FIELDS.filter(({ key }) =>
                this.ruleRefMatchesSourceField((source as any)[key], this.resourceName, this.resourceId));

            const matchingPolicies = (source.provisioningPolicies ?? []).filter((policy: any) =>
                (policy.fields ?? []).some((field: any) =>
                    this.transformReferencesRule(field.transform, this.resourceName, this.resourceId)));

            if (fieldMatches.length === 0 && matchingPolicies.length === 0) {
                continue;
            }

            this.addNodeOnce({
                id: source.id,
                type: "source",
                label: source.name,
                description: source.description ?? undefined,
                resourceId: source.id,
                data: source
            });

            this.edges.push({
                id: `${DependencyService.rootId}-${source.id}`,
                source: DependencyService.rootId,
                target: source.id,
                label: fieldMatches[0]?.label ?? "provisioning policy"
            });

            for (const policy of matchingPolicies) {
                const policyId = `${source.id}::${policy.name}`;
                this.nodes.push({
                    id: policyId,
                    type: "provisioning-policy",
                    label: policy.usageType,
                    description: policy.description ?? undefined,
                    resourceId: policyId,
                    attributes: {
                        usageType: policy.usageType
                    },
                    data: policy
                });

                this.edges.push({
                    id: `${source.id}-${policyId}`,
                    source: source.id,
                    target: policyId,
                    label: "provisioning policy"
                });
            }
        }
    }
}
