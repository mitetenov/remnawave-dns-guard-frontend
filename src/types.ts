export interface Pool {id:string;name:string;hostname:string;zone_id:string;ttl:number;interval_seconds:number;failure_threshold:number;recovery_threshold:number;automation_enabled:boolean;profile_configured:boolean;created_at:string}
export type PoolInput = Omit<Pool,'id'|'profile_configured'|'created_at'>;
export type TargetStatus = 'unknown'|'healthy'|'suspect'|'excluded'|'recovering'|'disabled'|'protected';
export interface Target {id:string;pool_id:string;name:string;ip:string;remnawave_uuid:string|null;manual_enabled:boolean;status:TargetStatus;dns_present:boolean;failures:number;successes:number;last_checked_at:string|null;last_latency_ms:number|null;last_error:string|null}
export interface Overview {pools:number;targets:number;healthy:number;excluded:number;agent_last_seen:string|null;agent_healthy:boolean;cloudflare_configured:boolean;remnawave_configured:boolean}
export interface Settings {cloudflare_configured:boolean;remnawave_configured:boolean;remnawave_url:string;agent_last_seen:string|null;agent_healthy:boolean}
export interface GuardEvent {id:string;created_at:string;level:'info'|'warning'|'error';type:'check'|'dns'|'manual'|'system';message:string;pool_id:string|null;target_id:string|null}
export interface Zone {id:string;name:string}
export interface Node {uuid:string;name:string;address:string;is_connected:boolean;config_profile_uuid?:string}
export interface Host {uuid:string;remark:string;address:string;port:number;node_uuids:string[]}
export interface ProbeProfile {port:number;uuid:string;transport:'tcp'|'xhttp';security:'reality'|'tls';server_name:string;public_key:string;short_id:string;flow:string;fingerprint:string;path:string;host:string;xhttp_mode:string}
