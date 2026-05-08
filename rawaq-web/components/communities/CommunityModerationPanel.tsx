'use client'

import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type {
  CommunityAdminEntry,
  CommunityHostEntry,
  CommunityHostRequestEntry,
  HappeningReportEntry,
  CommunityAuditLogEntry,
  MemberHistoryState,
} from '@/types/community-moderation'

type PanelCommunity = {
  slug: string
  name: string
  member_count: number
  is_verified: boolean
  owner_user_id: string | null
  recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
  timed_out_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string; timeout_until: string | null }>
}

export interface CommunityModerationPanelProps {
  community: PanelCommunity
  user: { id: string } | null
  admins: CommunityAdminEntry[]
  adminsLoading: boolean
  hosts: CommunityHostEntry[]
  hostsLoading: boolean
  hostRequests: CommunityHostRequestEntry[]
  hostRequestsLoading: boolean
  reports: HappeningReportEntry[]
  reportsLoading: boolean
  auditLogs: CommunityAuditLogEntry[]
  auditLogsLoading: boolean
  memberActionLoading: string | null
  reportActionLoading: string | null
  selectedMemberHistory: MemberHistoryState | null
  historyLoading: boolean
  isCommunityOwner: boolean
  canModerate: boolean
  onAssignAdmin: (userId: string) => void
  onRevokeAdmin: (userId: string) => void
  onAssignHost: (userId: string) => void
  onRevokeHost: (userId: string) => void
  onRespondToHostRequest: (requestId: string, action: 'approve' | 'reject') => void
  onIssueWarning: (userId: string) => void
  onIssueSanction: (userId: string, sanctionType: 'timeout' | 'removed' | 'banned') => void
  onUpdateReport: (reportItem: HappeningReportEntry, status: 'resolved' | 'dismissed') => void
  onLoadMemberHistory: (member: PanelCommunity['recent_members'][number]) => void
  onExportCsv: () => void
  onRemoveTimedOut: () => void
  onRefreshReports: () => void
  onRefreshAuditLogs: () => void
  onClearMemberHistory: () => void
}

function auditActionLabel(action: string): string {
  switch (action) {
    case 'assign_community_admin': return 'Assigned community admin'
    case 'revoke_community_admin': return 'Revoked community admin'
    case 'assign_host_role': return 'Assigned host role'
    case 'revoke_host_role': return 'Revoked host role'
    case 'resolve_happening_report': return 'Resolved happening report'
    case 'dismiss_happening_report': return 'Dismissed happening report'
    case 'warn_member': return 'Warned member'
    case 'timeout_member': return 'Timed out member'
    case 'remove_member': return 'Removed member'
    case 'ban_member': return 'Banned member'
    case 'revoke_sanction': return 'Revoked sanction'
    default: return action
  }
}

export function CommunityModerationPanel({
  community,
  user,
  admins,
  adminsLoading,
  hosts,
  hostsLoading,
  hostRequests,
  hostRequestsLoading,
  reports,
  reportsLoading,
  auditLogs,
  auditLogsLoading,
  memberActionLoading,
  reportActionLoading,
  selectedMemberHistory,
  historyLoading,
  isCommunityOwner,
  canModerate,
  onAssignAdmin,
  onRevokeAdmin,
  onAssignHost,
  onRevokeHost,
  onRespondToHostRequest,
  onIssueWarning,
  onIssueSanction,
  onUpdateReport,
  onLoadMemberHistory,
  onExportCsv,
  onRemoveTimedOut,
  onRefreshReports,
  onRefreshAuditLogs,
  onClearMemberHistory,
}: CommunityModerationPanelProps) {
  return (
            <details className="group">
              <summary className="flex cursor-pointer select-none list-none items-center gap-3 rounded-2xl border border-red-100 bg-red-50/40 px-5 py-4 hover:bg-red-50/60 transition-colors">
                <span className="flex-1">
                  <span className="text-base font-semibold text-gray-900">Moderation Tools</span>
                  <span className="ml-2 text-xs text-gray-400">Members, reports, audit trail</span>
                </span>
                <svg className="h-5 w-5 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-4 space-y-4">

                {/* Member Management */}
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Member Management</h3>
                      <span className="text-xs text-gray-500">{community.member_count.toLocaleString()} members</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={onExportCsv}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        Export CSV
                      </button>
                      {isCommunityOwner && community.timed_out_members.length > 0 && (
                        <button onClick={onRemoveTimedOut} disabled={memberActionLoading === 'bulk-remove-timed-out'}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 cursor-pointer">
                          {memberActionLoading === 'bulk-remove-timed-out' ? 'Removing...' : 'Remove timed-out members'}
                        </button>
                      )}
                    </div>
                  </div>
                  {community.recent_members.length === 0 ? (
                    <p className="text-sm text-gray-500">No members yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {community.recent_members.map((member) => (
                        <div key={member.id} className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                            {member.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              member.display_name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{member.display_name}</p>
                            <p className="text-xs text-gray-500">Joined {formatDate(member.joined_at)}</p>
                            {admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin') && (
                              <p className="text-[11px] font-semibold text-brand-600 mt-1">Community admin</p>
                            )}
                            {hosts.some((h) => h.user_id === member.id) && (
                              <p className="text-[11px] font-semibold text-violet-600 mt-1">Host</p>
                            )}
                            {community.owner_user_id === member.id && (
                              <p className="text-[11px] font-semibold text-amber-600 mt-1">Owner</p>
                            )}
                          </div>
                          {canModerate && (
                            <div className="ml-auto flex flex-wrap gap-2">
                              {isCommunityOwner &&
                                community.owner_user_id !== member.id &&
                                !admins.some((entry) => entry.user_id === member.id && entry.role === 'owner') && (
                                admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin') ? (
                                  <button onClick={() => onRevokeAdmin(member.id)} disabled={memberActionLoading === `revoke-${member.id}`}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 cursor-pointer">
                                    Revoke admin
                                  </button>
                                ) : (
                                  <button onClick={() => onAssignAdmin(member.id)} disabled={memberActionLoading === `assign-${member.id}`}
                                    className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 cursor-pointer">
                                    Make admin
                                  </button>
                                )
                              )}
                              {isCommunityOwner &&
                                community.owner_user_id !== member.id && (
                                hosts.some((h) => h.user_id === member.id) ? (
                                  <button onClick={() => onRevokeHost(member.id)} disabled={memberActionLoading === `revoke-host-${member.id}`}
                                    className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 cursor-pointer">
                                    Revoke host
                                  </button>
                                ) : (
                                  <button onClick={() => onAssignHost(member.id)} disabled={memberActionLoading === `assign-host-${member.id}`}
                                    className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 cursor-pointer">
                                    Make host
                                  </button>
                                )
                              )}
                              {community.owner_user_id !== member.id &&
                                !admins.some((entry) => entry.user_id === member.id && entry.role === 'owner') &&
                                member.id !== user?.id &&
                                (isCommunityOwner || !admins.some((entry) => entry.user_id === member.id && entry.role === 'community_admin')) && (
                                <>
                                  <button onClick={() => onIssueWarning(member.id)} disabled={memberActionLoading === `warn-${member.id}`}
                                    className="rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-[11px] font-semibold text-yellow-700 cursor-pointer">
                                    Warn
                                  </button>
                                  <button onClick={() => onLoadMemberHistory(member)} disabled={historyLoading && selectedMemberHistory?.member.id === member.id}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                    History
                                  </button>
                                  <button onClick={() => onIssueSanction(member.id, 'timeout')} disabled={memberActionLoading === `timeout-${member.id}`}
                                    className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 cursor-pointer">
                                    Timeout
                                  </button>
                                  <button onClick={() => onIssueSanction(member.id, 'removed')} disabled={memberActionLoading === `removed-${member.id}`}
                                    className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 cursor-pointer">
                                    Remove
                                  </button>
                                  <button onClick={() => onIssueSanction(member.id, 'banned')} disabled={memberActionLoading === `banned-${member.id}`}
                                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 cursor-pointer">
                                    Ban
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Moderation History */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Moderation History</h3>
                      <p className="text-xs text-gray-500 mt-1">Warnings and sanctions for the selected member.</p>
                    </div>
                    {selectedMemberHistory && (
                      <button onClick={() => onClearMemberHistory()}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        Clear
                      </button>
                    )}
                  </div>
                  {historyLoading ? (
                    <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                  ) : !selectedMemberHistory ? (
                    <p className="text-sm text-gray-500">Choose a member and tap History to inspect moderation records.</p>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{selectedMemberHistory.member.display_name}</p>
                        <p className="text-xs text-gray-500">Warnings: {selectedMemberHistory.warnings.length} · Sanctions: {selectedMemberHistory.sanctions.length}</p>
                      </div>
                      <div className="space-y-2">
                        {selectedMemberHistory.warnings.map((warning) => (
                          <div key={warning.id} className="rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">{warning.severity} warning</p>
                            <p className="text-sm text-gray-800 mt-1">{warning.reason}</p>
                            <p className="text-xs text-gray-500 mt-1">{formatDate(warning.created_at)}</p>
                          </div>
                        ))}
                        {selectedMemberHistory.sanctions.map((sanction) => (
                          <div key={sanction.id} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{sanction.sanction_type}</p>
                            <p className="text-sm text-gray-800 mt-1">{sanction.reason}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Started {formatDate(sanction.starts_at)}
                              {sanction.ends_at ? ` · Ends ${formatDate(sanction.ends_at)}` : ''}
                              {sanction.revoked_at ? ` · Revoked ${formatDate(sanction.revoked_at)}` : ''}
                            </p>
                          </div>
                        ))}
                        {selectedMemberHistory.warnings.length === 0 && selectedMemberHistory.sanctions.length === 0 && (
                          <p className="text-sm text-gray-500">No moderation history for this member yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timed-out Members */}
                {community.timed_out_members.length > 0 && (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Timed-out Members</h3>
                        <p className="text-xs text-gray-500">These members are temporarily restricted.</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-orange-700">
                        {community.timed_out_members.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {community.timed_out_members.map((member) => (
                        <div key={`timedout-${member.id}`} className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-sm font-semibold text-orange-700">
                            {member.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              member.display_name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{member.display_name}</p>
                            <p className="text-xs text-gray-500">
                              Timeout until {member.timeout_until ? formatDate(member.timeout_until) : 'unknown'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Community Admins + Community Hosts + Happening Reports */}
                <div className="grid gap-4 md:grid-cols-2">
                  {isCommunityOwner && (
                    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-gray-900">Community Admins</h3>
                        <span className="text-xs font-semibold text-brand-700">{admins.length} roles</span>
                      </div>
                      {adminsLoading ? (
                        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                      ) : admins.length === 0 ? (
                        <p className="text-sm text-gray-500">No community admins assigned yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {admins.map((entry) => (
                            <div key={entry.user_id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{entry.profile?.display_name ?? entry.user_id}</p>
                                  <p className="text-xs text-gray-500">{entry.role} · joined {formatDate(entry.joined_at)}</p>
                                </div>
                                {entry.role === 'community_admin' && (
                                  <button onClick={() => onRevokeAdmin(entry.user_id)} disabled={memberActionLoading === `revoke-${entry.user_id}`}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 cursor-pointer">
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {isCommunityOwner && (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Community Hosts</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Can create sessions inside this community</p>
                        </div>
                        <span className="text-xs font-semibold text-violet-700">{hosts.length} hosts</span>
                      </div>
                      {hostsLoading ? (
                        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                      ) : hosts.length === 0 ? (
                        <p className="text-sm text-gray-500">No hosts assigned yet. Use &quot;Make host&quot; in the member list above.</p>
                      ) : (
                        <div className="space-y-3">
                          {hosts.map((host) => (
                            <div key={host.user_id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{host.profile?.display_name ?? host.user_id}</p>
                                  <p className="text-xs text-gray-500">Host · granted {formatDate(host.granted_at)}</p>
                                </div>
                                <button onClick={() => onRevokeHost(host.user_id)} disabled={memberActionLoading === `revoke-host-${host.user_id}`}
                                  className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 cursor-pointer">
                                  Revoke
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {isCommunityOwner && (
                    <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Pending Host Requests</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Individual hosts requesting to join as host</p>
                        </div>
                        {hostRequests.length > 0 && (
                          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                            {hostRequests.length}
                          </span>
                        )}
                      </div>
                      {hostRequestsLoading ? (
                        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                      ) : hostRequests.length === 0 ? (
                        <p className="text-sm text-gray-500">No pending host requests.</p>
                      ) : (
                        <div className="space-y-3">
                          {hostRequests.map((req) => (
                            <div key={req.id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {req.profile?.display_name ?? req.user_id}
                                  </p>
                                  {req.organizer_profile?.plan_id && (
                                    <p className="text-xs text-purple-600 font-medium mt-0.5">{req.organizer_profile.plan_id}</p>
                                  )}
                                  {req.message && (
                                    <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{req.message}</p>
                                  )}
                                  <p className="text-xs text-gray-400 mt-1">{formatDate(req.created_at)}</p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    onClick={() => onRespondToHostRequest(req.id, 'approve')}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => onRespondToHostRequest(req.id, 'reject')}
                                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {canModerate && (
                    <div className="rounded-2xl border border-red-100 bg-red-50/50 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Happening Reports</h3>
                          <p className="text-xs text-gray-500 mt-1">Community admins review these directly.</p>
                        </div>
                        <button onClick={onRefreshReports} disabled={reportsLoading}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 cursor-pointer">
                          Refresh
                        </button>
                      </div>
                      {reportsLoading ? (
                        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                      ) : reports.length === 0 ? (
                        <p className="text-sm text-gray-500">No pending happening reports.</p>
                      ) : (
                        <div className="space-y-3">
                          {reports.map((reportItem) => (
                            <div key={`${reportItem.happening_id}:${reportItem.reporter_id}`}
                              className="rounded-xl border border-white/70 bg-white px-4 py-3">
                              <p className="text-sm font-semibold text-gray-900">{reportItem.reason}</p>
                              <p className="text-xs text-gray-500 mt-1">Reporter: {reportItem.reporter?.display_name ?? reportItem.reporter_id}</p>
                              {reportItem.happening && (
                                <p className="text-xs text-gray-600 mt-2 line-clamp-2">{reportItem.happening.body}</p>
                              )}
                              {reportItem.details && <p className="text-xs text-gray-500 mt-2">{reportItem.details}</p>}
                              <div className="mt-3 flex gap-2">
                                <button onClick={() => onUpdateReport(reportItem, 'resolved')}
                                  disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:resolved`}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 cursor-pointer">
                                  Resolve
                                </button>
                                <button onClick={() => onUpdateReport(reportItem, 'dismissed')}
                                  disabled={reportActionLoading === `${reportItem.happening_id}:${reportItem.reporter_id}:dismissed`}
                                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Audit Trail */}
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Community Audit Trail</h3>
                      <p className="text-xs text-gray-500 mt-1">Recent governance actions by owners and community admins.</p>
                    </div>
                    <button onClick={onRefreshAuditLogs} disabled={auditLogsLoading}
                      className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 cursor-pointer">
                      Refresh
                    </button>
                  </div>
                  {auditLogsLoading ? (
                    <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                  ) : auditLogs.length === 0 ? (
                    <p className="text-sm text-gray-500">No governance actions recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-white/70 bg-white px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{auditActionLabel(log.action)}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {log.actor?.display_name ?? log.actor_user_id} · {formatDate(log.created_at)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Target: {log.target_type}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
  )
}
