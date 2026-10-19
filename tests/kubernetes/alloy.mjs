import assert from 'node:assert/strict';

// Keep the Compose pipeline, but discover individual pods instead of scraping a ClusterIP.
export function alloyConfiguration(source) {
  const pattern = /(prometheus\.scrape "mythical" \{[\s\S]*?\btargets\s*=\s*)\[[\s\S]*?\]/;
  const match = source.match(pattern);
  assert(match?.[0].includes('mythical-server:4000') && match[0].includes('mythical-requester:4001'),
    'Expected the Compose application scrape targets in the Alloy configuration');
  return source.replace(pattern, '$1discovery.relabel.kubernetes_mythical.output') + `
// Test-cluster discovery is restricted to application pods in the default namespace.
discovery.kubernetes "kubernetes_mythical" {
    role = "pod"
    namespaces {
        names = ["default"]
    }
    selectors {
        role = "pod"
        label = "name in (mythical-server,mythical-requester)"
    }
}

discovery.relabel "kubernetes_mythical" {
    targets = discovery.kubernetes.kubernetes_mythical.targets
    rule {
        source_labels = ["__meta_kubernetes_pod_phase"]
        regex = "Running"
        action = "keep"
    }
    rule {
        source_labels = ["__meta_kubernetes_pod_label_name"]
        target_label = "service"
    }
    rule {
        target_label = "group"
        replacement = "mythical"
    }
    rule {
        source_labels = ["__meta_kubernetes_pod_ip", "__meta_kubernetes_pod_label_name"]
        regex = "(.+);mythical-server"
        target_label = "__address__"
        replacement = "$1:4000"
    }
    rule {
        source_labels = ["__meta_kubernetes_pod_ip", "__meta_kubernetes_pod_label_name"]
        regex = "(.+);mythical-requester"
        target_label = "__address__"
        replacement = "$1:4001"
    }
}
`;
}
