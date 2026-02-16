export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          payload: Json | null
          status: string | null
          triggered_at: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          payload?: Json | null
          status?: string | null
          triggered_at?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          payload?: Json | null
          status?: string | null
          triggered_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_facts: {
        Row: {
          approved_by: string | null
          category: string | null
          created_at: string | null
          id: string
          jurisdiction: string | null
          last_reviewed: string | null
          org_id: string
          owner_department: string | null
          source_link: string | null
          statement_text: string
          status: string | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          last_reviewed?: string | null
          org_id: string
          owner_department?: string | null
          source_link?: string | null
          statement_text: string
          status?: string | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          last_reviewed?: string | null
          org_id?: string
          owner_department?: string | null
          source_link?: string | null
          statement_text?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approved_facts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_templates: {
        Row: {
          created_at: string | null
          id: string
          name: string
          org_id: string
          platform_length: string | null
          required_fact_categories: string[] | null
          scenario_type: string | null
          status: string | null
          template_text: string
          tone: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          platform_length?: string | null
          required_fact_categories?: string[] | null
          scenario_type?: string | null
          status?: string | null
          template_text: string
          tone?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          platform_length?: string | null
          required_fact_categories?: string[] | null
          scenario_type?: string | null
          status?: string | null
          template_text?: string
          tone?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approved_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_extractions: {
        Row: {
          category: string | null
          claim_text: string
          confidence: number | null
          created_at: string | null
          id: string
          mention_id: string | null
          pasted_input_id: string | null
        }
        Insert: {
          category?: string | null
          claim_text: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          mention_id?: string | null
          pasted_input_id?: string | null
        }
        Update: {
          category?: string | null
          claim_text?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          mention_id?: string | null
          pasted_input_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_extractions_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_comments: {
        Row: {
          content: string
          created_at: string | null
          escalation_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          escalation_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          escalation_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_comments_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: false
            referencedRelation: "escalations"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          department: string | null
          description: string | null
          id: string
          org_id: string
          pasted_text: string | null
          priority: string | null
          related_mention_ids: string[] | null
          related_narrative_ids: string[] | null
          requester_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          id?: string
          org_id: string
          pasted_text?: string | null
          priority?: string | null
          related_mention_ids?: string[] | null
          related_narrative_ids?: string[] | null
          requester_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          id?: string
          org_id?: string
          pasted_text?: string | null
          priority?: string | null
          related_mention_ids?: string[] | null
          related_narrative_ids?: string[] | null
          requester_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string | null
          id: string
          last_exported_at: string | null
          mapping: Json | null
          org_id: string
          sheet_id: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_exported_at?: string | null
          mapping?: Json | null
          org_id: string
          sheet_id?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_exported_at?: string | null
          mapping?: Json | null
          org_id?: string
          sheet_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          incident_id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          incident_id: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          incident_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_mentions: {
        Row: {
          incident_id: string
          mention_id: string
        }
        Insert: {
          incident_id: string
          mention_id: string
        }
        Update: {
          incident_id?: string
          mention_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_mentions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_mentions_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_narratives: {
        Row: {
          incident_id: string
          narrative_id: string
        }
        Insert: {
          incident_id: string
          narrative_id: string
        }
        Update: {
          incident_id?: string
          narrative_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_narratives_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_narratives_narrative_id_fkey"
            columns: ["narrative_id"]
            isOneToOne: false
            referencedRelation: "narratives"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          name: string
          org_id: string
          owner_id: string | null
          stakeholders: string[] | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          name: string
          org_id: string
          owner_id?: string | null
          stakeholders?: string[] | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          stakeholders?: string[] | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          created_at: string | null
          id: string
          locked: boolean | null
          org_id: string
          status: string | null
          type: string
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          org_id: string
          status?: string | null
          type: string
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          org_id?: string
          status?: string | null
          type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_narratives: {
        Row: {
          mention_id: string
          narrative_id: string
        }
        Insert: {
          mention_id: string
          narrative_id: string
        }
        Update: {
          mention_id?: string
          narrative_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_narratives_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_narratives_narrative_id_fkey"
            columns: ["narrative_id"]
            isOneToOne: false
            referencedRelation: "narratives"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_people: {
        Row: {
          mention_id: string
          person_id: string
          relation_type: string | null
        }
        Insert: {
          mention_id: string
          person_id: string
          relation_type?: string | null
        }
        Update: {
          mention_id?: string
          person_id?: string
          relation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mention_people_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_topics: {
        Row: {
          mention_id: string
          topic_id: string
        }
        Insert: {
          mention_id: string
          topic_id: string
        }
        Update: {
          mention_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_topics_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          author_follower_count: number | null
          author_handle: string | null
          author_name: string | null
          author_verified: boolean | null
          content: string | null
          created_at: string | null
          flags: Json | null
          id: string
          language: string | null
          metrics: Json | null
          org_id: string
          owner_user_id: string | null
          posted_at: string | null
          scan_run_id: string | null
          sentiment_confidence: number | null
          sentiment_label: string | null
          sentiment_score: number | null
          severity: string | null
          source: string
          status: string | null
          url: string | null
        }
        Insert: {
          author_follower_count?: number | null
          author_handle?: string | null
          author_name?: string | null
          author_verified?: boolean | null
          content?: string | null
          created_at?: string | null
          flags?: Json | null
          id?: string
          language?: string | null
          metrics?: Json | null
          org_id: string
          owner_user_id?: string | null
          posted_at?: string | null
          scan_run_id?: string | null
          sentiment_confidence?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          severity?: string | null
          source: string
          status?: string | null
          url?: string | null
        }
        Update: {
          author_follower_count?: number | null
          author_handle?: string | null
          author_name?: string | null
          author_verified?: boolean | null
          content?: string | null
          created_at?: string | null
          flags?: Json | null
          id?: string
          language?: string | null
          metrics?: Json | null
          org_id?: string
          owner_user_id?: string | null
          posted_at?: string | null
          scan_run_id?: string | null
          sentiment_confidence?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          severity?: string | null
          source?: string
          status?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      narratives: {
        Row: {
          confidence: number | null
          created_at: string | null
          description: string | null
          example_phrases: string[] | null
          first_seen: string | null
          id: string
          last_seen: string | null
          name: string
          org_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          example_phrases?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          name: string
          org_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          example_phrases?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          name?: string
          org_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "narratives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_email: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_email?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_email?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_people: {
        Row: {
          confidence: number | null
          created_at: string | null
          evidence: string | null
          id: string
          org_id: string
          person_id: string
          status: string | null
          tier: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          evidence?: string | null
          id?: string
          org_id: string
          person_id: string
          status?: string | null
          tier?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          evidence?: string | null
          id?: string
          org_id?: string
          person_id?: string
          status?: string | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          domain: string | null
          id: string
          incident_mode: boolean | null
          industry: string | null
          languages: string[] | null
          name: string
          plan: string | null
          regions: string[] | null
          scan_quota: number | null
          slug: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          id?: string
          incident_mode?: boolean | null
          industry?: string | null
          languages?: string[] | null
          name: string
          plan?: string | null
          regions?: string[] | null
          scan_quota?: number | null
          slug: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          id?: string
          incident_mode?: boolean | null
          industry?: string | null
          languages?: string[] | null
          name?: string
          plan?: string | null
          regions?: string[] | null
          scan_quota?: number | null
          slug?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string | null
          follower_count: number | null
          handles: Json | null
          id: string
          links: string[] | null
          name: string
          titles: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          follower_count?: number | null
          handles?: Json | null
          id?: string
          links?: string[] | null
          name: string
          titles?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          follower_count?: number | null
          handles?: Json | null
          id?: string
          links?: string[] | null
          name?: string
          titles?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      response_drafts: {
        Row: {
          claims_extracted: Json | null
          created_at: string | null
          created_by: string | null
          facts_used: Json | null
          id: string
          input_text: string
          links_used: Json | null
          org_id: string
          output_text: string | null
          source_mention_id: string | null
          source_type: string | null
          status: string | null
        }
        Insert: {
          claims_extracted?: Json | null
          created_at?: string | null
          created_by?: string | null
          facts_used?: Json | null
          id?: string
          input_text: string
          links_used?: Json | null
          org_id: string
          output_text?: string | null
          source_mention_id?: string | null
          source_type?: string | null
          status?: string | null
        }
        Update: {
          claims_extracted?: Json | null
          created_at?: string | null
          created_by?: string | null
          facts_used?: Json | null
          id?: string
          input_text?: string
          links_used?: Json | null
          org_id?: string
          output_text?: string | null
          source_mention_id?: string | null
          source_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "response_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_drafts_source_mention_id_fkey"
            columns: ["source_mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_runs: {
        Row: {
          config_snapshot: Json | null
          created_at: string | null
          emergencies_count: number | null
          finished_at: string | null
          id: string
          negative_pct: number | null
          org_id: string
          started_at: string | null
          status: string | null
          total_mentions: number | null
        }
        Insert: {
          config_snapshot?: Json | null
          created_at?: string | null
          emergencies_count?: number | null
          finished_at?: string | null
          id?: string
          negative_pct?: number | null
          org_id: string
          started_at?: string | null
          status?: string | null
          total_mentions?: number | null
        }
        Update: {
          config_snapshot?: Json | null
          created_at?: string | null
          emergencies_count?: number | null
          finished_at?: string | null
          id?: string
          negative_pct?: number | null
          org_id?: string
          started_at?: string | null
          status?: string | null
          total_mentions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_templates: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          config: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          org_id: string
          type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          org_id: string
          type: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          org_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          org_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          org_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_profiles: {
        Row: {
          alert_emails: string[] | null
          created_at: string | null
          escalation_emails: string[] | null
          id: string
          org_id: string
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          scan_schedule: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          alert_emails?: string[] | null
          created_at?: string | null
          escalation_emails?: string[] | null
          id?: string
          org_id: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          scan_schedule?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          alert_emails?: string[] | null
          created_at?: string | null
          escalation_emails?: string[] | null
          id?: string
          org_id?: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          scan_schedule?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_google_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          google_email: string | null
          id: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          google_email?: string | null
          id?: string
          org_id: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          google_email?: string | null
          id?: string
          org_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_google_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "analyst" | "approver" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "analyst", "approver", "viewer"],
    },
  },
} as const
