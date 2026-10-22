import {
  useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  DeviceEventEmitter,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CAPABILITIES } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { showAlert } from '../../src/lib/alert';
import { usePermissions } from '../../src/hooks/usePermissions';
import { BRANDING_UPDATED_EVENT } from '../../src/hooks/useBranding';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField } from '../../src/components/form/FormControls';
import { AppText } from '../../src/components/AppText';

// Validación de color igual que la web (#RRGGBB o #RRGGBBAA).
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Paletas prediseñadas (mismo punto de partida que la web).
const BRAND_PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: 'Verde Agro', primary: '#1b5e20', secondary: '#4caf50' },
  { name: 'Arándano', primary: '#3730a3', secondary: '#6366f1' },
  { name: 'Cereza', primary: '#9f1239', secondary: '#fb7185' },
  { name: 'Cítrico', primary: '#c2410c', secondary: '#fb923c' },
  { name: 'Océano', primary: '#0e7490', secondary: '#22d3ee' },
  { name: 'Vid', primary: '#6b21a8', secondary: '#c084fc' },
  { name: 'Tierra', primary: '#78350f', secondary: '#d97706' },
  { name: 'Pizarra', primary: '#334155', secondary: '#94a3b8' },
];

const ROLE_KEYS = ['admin', 'supervisor', 'crew_lead', 'worker'] as const;
type RoleKey = (typeof ROLE_KEYS)[number];
const ROLE_DEFAULTS: Record<RoleKey, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  crew_lead: 'Encargado',
  worker: 'Trabajador',
};

type RoleLabels = Partial<Record<RoleKey, string>>;

interface OrgRow {
  id: string;
  name: string | null;
  logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  crew_mode_enabled: boolean | null;
  rows_enabled: boolean | null;
  role_labels: RoleLabels | null;
}

type OrgPatch = Partial<{
  name: string;
  logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  crew_mode_enabled: boolean;
  rows_enabled: boolean;
  role_labels: RoleLabels;
}>;

export default function SettingsScreen() {
  const { has } = usePermissions();

  return (
    <AdminGuard>
      {has(CAPABILITIES.SETTINGS_MANAGE) ? (
        <SettingsContent />
      ) : (
        <EmptyState
          icon="lock-closed-outline"
          title="Acceso restringido"
          message="No tienes permiso para gestionar la configuración."
          iconColor={colors.amber}
        />
      )}
    </AdminGuard>
  );
}

function SettingsContent() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ['my-organization'],
    queryFn: async (): Promise<OrgRow | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select(
          'id, name, logo_url, brand_primary_color, brand_secondary_color, crew_mode_enabled, rows_enabled, role_labels',
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as OrgRow | null) ?? null;
    },
  });

  async function updateOrg(patch: OrgPatch): Promise<void> {
    if (!org?.id) throw new Error('No se encontró la organización');
    const { error } = await supabase.from('organizations').update(patch).eq('id', org.id);
    if (error) throw error;
  }

  if (isLoading) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <ListSkeleton count={4} />
      </ScrollView>
    );
  }

  if (!org) {
    return (
      <EmptyState
        icon="business-outline"
        title="Sin organización"
        message="No se pudo cargar la configuración de tu organización."
      />
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <AppText style={s.hint}>Marca, jerarquía y modo de operación de tu empresa.</AppText>
      <BrandingSection
        org={org}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['my-organization'] });
          // Re-aplica los colores/logo de marca al instante (sin recargar).
          DeviceEventEmitter.emit(BRANDING_UPDATED_EVENT);
        }}
        updateOrg={updateOrg}
      />
      <CrewModeSection
        org={org}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['org-settings'] })}
        updateOrg={updateOrg}
      />
      <RowsModeSection org={org} updateOrg={updateOrg} />
      <RoleLabelsSection
        org={org}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['org-settings'] })}
        updateOrg={updateOrg}
      />
    </ScrollView>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <View style={s.sectionIcon}>
          <Ionicons name={icon as never} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={s.sectionTitle}>{title}</AppText>
          <AppText style={s.sectionDesc}>{description}</AppText>
        </View>
      </View>
      {children}
    </View>
  );
}

function BrandingSection({
  org,
  onSaved,
  updateOrg,
}: {
  org: OrgRow;
  onSaved: () => void;
  updateOrg: (patch: OrgPatch) => Promise<void>;
}) {
  const [name, setName] = useState(org.name ?? '');
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '');
  const [primary, setPrimary] = useState(org.brand_primary_color ?? '#1b5e20');
  const [secondary, setSecondary] = useState(org.brand_secondary_color ?? '#4caf50');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: OrgPatch) => updateOrg(patch),
    onSuccess: () => {
      showAlert('Listo', 'Marca guardada.');
      onSaved();
    },
    onError: (e: unknown) =>
      showAlert('Error', e instanceof Error ? e.message : 'No se pudo guardar la marca'),
  });

  function submit() {
    if (!name.trim()) {
      setErr('El nombre es requerido');
      return;
    }
    if (primary && !HEX_RE.test(primary)) {
      setErr('Color primario inválido (#RRGGBB)');
      return;
    }
    if (secondary && !HEX_RE.test(secondary)) {
      setErr('Color secundario inválido (#RRGGBB)');
      return;
    }
    setErr(null);
    save.mutate({
      name: name.trim(),
      logo_url: logoUrl.trim() || null,
      brand_primary_color: primary || null,
      brand_secondary_color: secondary || null,
    });
  }

  const nameErr = err && err.includes('nombre') ? err : undefined;
  const primaryErr = err && err.includes('primario') ? err : undefined;
  const secondaryErr = err && err.includes('secundario') ? err : undefined;

  return (
    <Section icon="color-palette-outline" title="Marca" description="Nombre, logo y colores de tu empresa">
      <Field label="Nombre visible" required error={nameErr}>
        <TextField value={name} onChangeText={setName} hasError={!!nameErr} placeholder="Fundo360" />
      </Field>
      <Field label="URL del logo">
        <TextField
          value={logoUrl}
          onChangeText={setLogoUrl}
          placeholder="https://…"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>

      <AppText style={s.subLabel}>Paletas</AppText>
      <View style={s.presetRow}>
        {BRAND_PRESETS.map((p) => {
          const selected =
            primary.toLowerCase() === p.primary.toLowerCase() &&
            secondary.toLowerCase() === p.secondary.toLowerCase();
          return (
            <TouchableOpacity
              key={p.name}
              style={[s.preset, selected && s.presetSelected]}
              activeOpacity={0.7}
              onPress={() => {
                setPrimary(p.primary);
                setSecondary(p.secondary);
                setErr(null);
              }}
            >
              <View style={s.presetSwatch}>
                <View style={[s.swatchHalf, { backgroundColor: p.primary }]} />
                <View style={[s.swatchHalf, { backgroundColor: p.secondary }]} />
              </View>
              <AppText style={s.presetText}>{p.name}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.colorRow}>
        <View style={s.colorCol}>
          <Field label="Color primario" error={primaryErr}>
            <View style={s.hexRow}>
              <View
                style={[
                  s.swatchPreview,
                  { backgroundColor: HEX_RE.test(primary) ? primary.slice(0, 7) : colors.surface },
                ]}
              />
              <TextField
                value={primary}
                onChangeText={setPrimary}
                hasError={!!primaryErr}
                autoCapitalize="none"
                placeholder="#1b5e20"
                style={s.hexInput}
              />
            </View>
          </Field>
        </View>
        <View style={s.colorCol}>
          <Field label="Color secundario" error={secondaryErr}>
            <View style={s.hexRow}>
              <View
                style={[
                  s.swatchPreview,
                  { backgroundColor: HEX_RE.test(secondary) ? secondary.slice(0, 7) : colors.surface },
                ]}
              />
              <TextField
                value={secondary}
                onChangeText={setSecondary}
                hasError={!!secondaryErr}
                autoCapitalize="none"
                placeholder="#4caf50"
                style={s.hexInput}
              />
            </View>
          </Field>
        </View>
      </View>

      <TouchableOpacity
        style={[s.saveBtn, save.isPending && s.saveBtnDisabled]}
        activeOpacity={0.85}
        onPress={submit}
        disabled={save.isPending}
      >
        <AppText style={s.saveBtnText}>{save.isPending ? 'Guardando…' : 'Guardar marca'}</AppText>
      </TouchableOpacity>
    </Section>
  );
}

/** Toggle optimista con rollback en error (G4-AC8). */
function ToggleSection({
  icon,
  title,
  description,
  toggleLabel,
  toggleHint,
  initial,
  field,
  onSaved,
  updateOrg,
}: {
  icon: string;
  title: string;
  description: string;
  toggleLabel: string;
  toggleHint: string;
  initial: boolean;
  field: 'crew_mode_enabled' | 'rows_enabled';
  onSaved?: () => void;
  updateOrg: (patch: OrgPatch) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function onToggle(val: boolean) {
    const prev = enabled;
    setEnabled(val); // optimista
    setSaving(true);
    try {
      await updateOrg({ [field]: val } as OrgPatch);
      onSaved?.();
    } catch (e: unknown) {
      setEnabled(prev); // rollback
      showAlert('Error', e instanceof Error ? e.message : 'No se pudo guardar el cambio');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={icon} title={title} description={description}>
      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <AppText style={s.toggleLabel}>{toggleLabel}</AppText>
          <AppText style={s.toggleHint}>{toggleHint}</AppText>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={saving}
          trackColor={{ false: colors.cardBorder, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
    </Section>
  );
}

function CrewModeSection({
  org,
  onSaved,
  updateOrg,
}: {
  org: OrgRow;
  onSaved: () => void;
  updateOrg: (patch: OrgPatch) => Promise<void>;
}) {
  return (
    <ToggleSection
      icon="people-outline"
      title="Modo Capataz"
      description="Activa la figura del Encargado y las cuadrillas"
      toggleLabel="Usar cuadrillas y encargados"
      toggleHint="Cuando está activo, los campos pueden operar con un encargado que gestiona y paga a su cuadrilla. Puedes sobreescribir esto por campo en Campos."
      initial={!!org.crew_mode_enabled}
      field="crew_mode_enabled"
      onSaved={onSaved}
      updateOrg={updateOrg}
    />
  );
}

function RowsModeSection({
  org,
  updateOrg,
}: {
  org: OrgRow;
  updateOrg: (patch: OrgPatch) => Promise<void>;
}) {
  return (
    <ToggleSection
      icon="reorder-four-outline"
      title="Melgas"
      description="Habilita el registro de cosecha a nivel de melga (hilera)"
      toggleLabel="Usar melgas dentro de los paños"
      toggleHint="Cuando está activo, cada paño puede subdividirse en melgas (hileras) y la cosecha se registra por melga. Puedes sobreescribir esto por campo en Campos."
      initial={!!org.rows_enabled}
      field="rows_enabled"
      updateOrg={updateOrg}
    />
  );
}

function RoleLabelsSection({
  org,
  onSaved,
  updateOrg,
}: {
  org: OrgRow;
  onSaved: () => void;
  updateOrg: (patch: OrgPatch) => Promise<void>;
}) {
  const initial = (org.role_labels ?? {}) as RoleLabels;
  const [labels, setLabels] = useState<RoleLabels>(initial);

  const save = useMutation({
    mutationFn: (patch: OrgPatch) => updateOrg(patch),
    onSuccess: () => {
      showAlert('Listo', 'Etiquetas guardadas.');
      onSaved();
    },
    onError: (e: unknown) =>
      showAlert('Error', e instanceof Error ? e.message : 'No se pudieron guardar las etiquetas'),
  });

  function submit() {
    // Solo guardar etiquetas no vacías; las vacías usan el default.
    const clean: RoleLabels = {};
    for (const k of ROLE_KEYS) {
      const v = (labels[k] ?? '').trim();
      if (v) clean[k] = v;
    }
    save.mutate({ role_labels: clean });
  }

  return (
    <Section
      icon="pricetags-outline"
      title="Etiquetas de rol"
      description="Personaliza cómo se muestran los roles (no cambia la seguridad)"
    >
      {ROLE_KEYS.map((k) => (
        <Field key={k} label={`${ROLE_DEFAULTS[k]} (por defecto)`}>
          <TextField
            value={labels[k] ?? ''}
            placeholder={ROLE_DEFAULTS[k]}
            onChangeText={(text) => setLabels((prev) => ({ ...prev, [k]: text }))}
          />
        </Field>
      ))}
      <TouchableOpacity
        style={[s.saveBtn, save.isPending && s.saveBtnDisabled]}
        activeOpacity={0.85}
        onPress={submit}
        disabled={save.isPending}
      >
        <AppText style={s.saveBtnText}>{save.isPending ? 'Guardando…' : 'Guardar etiquetas'}</AppText>
      </TouchableOpacity>
    </Section>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 120 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  sectionDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  subLabel: { fontSize: 13, fontWeight: font.semibold, color: colors.text, marginBottom: spacing.sm },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  presetSelected: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  presetSwatch: { flexDirection: 'row', width: 24, height: 16, borderRadius: radius.sm, overflow: 'hidden' },
  swatchHalf: { flex: 1 },
  presetText: { fontSize: 12, fontWeight: font.medium, color: colors.text },
  colorRow: { flexDirection: 'row', gap: spacing.md },
  colorCol: { flex: 1 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatchPreview: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder },
  hexInput: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleLabel: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  toggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontWeight: font.semibold, color: colors.textWhite },
});
