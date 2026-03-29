export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          accent_color: string | null;
          created_at: string;
          email_from_address: string | null;
          email_from_name: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          primary_color: string | null;
          secondary_color: string | null;
          theme_mode: string | null;
        };
        Insert: {
          accent_color?: string | null;
          created_at?: string;
          email_from_address?: string | null;
          email_from_name?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          primary_color?: string | null;
          secondary_color?: string | null;
          theme_mode?: string | null;
        };
        Update: {
          accent_color?: string | null;
          created_at?: string;
          email_from_address?: string | null;
          email_from_name?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          primary_color?: string | null;
          secondary_color?: string | null;
          theme_mode?: string | null;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          agency_id: string;
          created_at: string;
          email: string;
          id: string;
          name: string;
          phone: string | null;
          role: Database["public"]["Enums"]["agent_role"];
          user_id: string;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["agent_role"];
          user_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["agent_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agents_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          address: string | null;
          agency_id: string;
          company_name: string | null;
          created_at: string;
          email: string | null;
          first_name: string | null;
          id: string;
          id_number: string | null;
          is_pep: boolean | null;
          last_name: string | null;
          phone: string | null;
          popia_consent_date: string | null;
          popia_consent_given: boolean | null;
          registration_number: string | null;
          risk_level: string | null;
          tax_number: string | null;
          type: Database["public"]["Enums"]["client_type"];
        };
        Insert: {
          address?: string | null;
          agency_id: string;
          company_name?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          id_number?: string | null;
          is_pep?: boolean | null;
          last_name?: string | null;
          phone?: string | null;
          popia_consent_date?: string | null;
          popia_consent_given?: boolean | null;
          registration_number?: string | null;
          risk_level?: string | null;
          tax_number?: string | null;
          type?: Database["public"]["Enums"]["client_type"];
        };
        Update: {
          address?: string | null;
          agency_id?: string;
          company_name?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          id_number?: string | null;
          is_pep?: boolean | null;
          last_name?: string | null;
          phone?: string | null;
          popia_consent_date?: string | null;
          popia_consent_given?: boolean | null;
          registration_number?: string | null;
          risk_level?: string | null;
          tax_number?: string | null;
          type?: Database["public"]["Enums"]["client_type"];
        };
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_certificates: {
        Row: {
          created_at: string;
          deal_id: string;
          document_id: string | null;
          expiry_date: string;
          id: string;
          type: Database["public"]["Enums"]["certificate_type"];
        };
        Insert: {
          created_at?: string;
          deal_id: string;
          document_id?: string | null;
          expiry_date: string;
          id?: string;
          type: Database["public"]["Enums"]["certificate_type"];
        };
        Update: {
          created_at?: string;
          deal_id?: string;
          document_id?: string | null;
          expiry_date?: string;
          id?: string;
          type?: Database["public"]["Enums"]["certificate_type"];
        };
        Relationships: [
          {
            foreignKeyName: "compliance_certificates_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_certificates_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_activity_log: {
        Row: {
          actor_email: string | null;
          actor_name: string | null;
          created_at: string;
          deal_id: string;
          description: string;
          event_type: string;
          id: string;
          metadata: Json | null;
        };
        Insert: {
          actor_email?: string | null;
          actor_name?: string | null;
          created_at?: string;
          deal_id: string;
          description: string;
          event_type: string;
          id?: string;
          metadata?: Json | null;
        };
        Update: {
          actor_email?: string | null;
          actor_name?: string | null;
          created_at?: string;
          deal_id?: string;
          description?: string;
          event_type?: string;
          id?: string;
          metadata?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "deal_activity_log_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_participants: {
        Row: {
          client_id: string;
          created_at: string;
          deal_id: string;
          id: string;
          role: Database["public"]["Enums"]["participant_role"];
        };
        Insert: {
          client_id: string;
          created_at?: string;
          deal_id: string;
          id?: string;
          role: Database["public"]["Enums"]["participant_role"];
        };
        Update: {
          client_id?: string;
          created_at?: string;
          deal_id?: string;
          id?: string;
          role?: Database["public"]["Enums"]["participant_role"];
        };
        Relationships: [
          {
            foreignKeyName: "deal_participants_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_participants_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          agency_id: string;
          agent_id: string;
          created_at: string;
          deal_type: Database["public"]["Enums"]["deal_type"];
          id: string;
          occupation_date: string | null;
          property_address: string;
          property24_url: string | null;
          status: Database["public"]["Enums"]["deal_status"];
          updated_at: string;
        };
        Insert: {
          agency_id: string;
          agent_id: string;
          created_at?: string;
          deal_type: Database["public"]["Enums"]["deal_type"];
          id?: string;
          occupation_date?: string | null;
          property_address: string;
          property24_url?: string | null;
          status?: Database["public"]["Enums"]["deal_status"];
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          agent_id?: string;
          created_at?: string;
          deal_type?: Database["public"]["Enums"]["deal_type"];
          id?: string;
          occupation_date?: string | null;
          property_address?: string;
          property24_url?: string | null;
          status?: Database["public"]["Enums"]["deal_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          document_id: string;
          file_url: string;
          id: string;
          notes: string | null;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          file_url: string;
          id?: string;
          notes?: string | null;
          version_number?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          file_url?: string;
          id?: string;
          notes?: string | null;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          client_id: string | null;
          created_at: string;
          current_version: number | null;
          deal_id: string;
          expiration_date: string | null;
          expiry_date: string | null;
          file_name: string;
          file_url: string;
          id: string;
          rejected_reason: string | null;
          status: Database["public"]["Enums"]["document_status"];
          tag: string;
          uploaded_by_agent: boolean;
          verified: boolean;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          current_version?: number | null;
          deal_id: string;
          expiration_date?: string | null;
          expiry_date?: string | null;
          file_name: string;
          file_url: string;
          id?: string;
          rejected_reason?: string | null;
          status?: Database["public"]["Enums"]["document_status"];
          tag: string;
          uploaded_by_agent?: boolean;
          verified?: boolean;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          current_version?: number | null;
          deal_id?: string;
          expiration_date?: string | null;
          expiry_date?: string | null;
          file_name?: string;
          file_url?: string;
          id?: string;
          rejected_reason?: string | null;
          status?: Database["public"]["Enums"]["document_status"];
          tag?: string;
          uploaded_by_agent?: boolean;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      esignature_placements: {
        Row: {
          created_at: string;
          esignature_request_id: string;
          height: number;
          id: string;
          page: number;
          signature_data_url: string | null;
          signed_at: string | null;
          type: string;
          width: number;
          x: number;
          y: number;
        };
        Insert: {
          created_at?: string;
          esignature_request_id: string;
          height?: number;
          id?: string;
          page?: number;
          signature_data_url?: string | null;
          signed_at?: string | null;
          type?: string;
          width?: number;
          x: number;
          y: number;
        };
        Update: {
          created_at?: string;
          esignature_request_id?: string;
          height?: number;
          id?: string;
          page?: number;
          signature_data_url?: string | null;
          signed_at?: string | null;
          type?: string;
          width?: number;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "esignature_placements_esignature_request_id_fkey";
            columns: ["esignature_request_id"];
            isOneToOne: false;
            referencedRelation: "esignature_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      esignature_requests: {
        Row: {
          client_id: string | null;
          created_at: string;
          created_by_agent_id: string | null;
          deal_id: string;
          document_id: string | null;
          document_name: string;
          id: string;
          signature_data_url: string | null;
          signed_at: string | null;
          signer_ip: string | null;
          signer_name: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          created_by_agent_id?: string | null;
          deal_id: string;
          document_id?: string | null;
          document_name: string;
          id?: string;
          signature_data_url?: string | null;
          signed_at?: string | null;
          signer_ip?: string | null;
          signer_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          created_by_agent_id?: string | null;
          deal_id?: string;
          document_id?: string | null;
          document_name?: string;
          id?: string;
          signature_data_url?: string | null;
          signed_at?: string | null;
          signer_ip?: string | null;
          signer_name?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "esignature_requests_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esignature_requests_created_by_agent_id_fkey";
            columns: ["created_by_agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esignature_requests_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esignature_requests_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      esignature_tokens: {
        Row: {
          created_at: string;
          esignature_request_id: string;
          expires_at: string;
          id: string;
          token: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          esignature_request_id: string;
          expires_at: string;
          id?: string;
          token?: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          esignature_request_id?: string;
          expires_at?: string;
          id?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "esignature_tokens_esignature_request_id_fkey";
            columns: ["esignature_request_id"];
            isOneToOne: false;
            referencedRelation: "esignature_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      follow_up_log: {
        Row: {
          client_id: string;
          created_at: string;
          deal_id: string;
          id: string;
          sent_at: string;
          type: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          deal_id: string;
          id?: string;
          sent_at?: string;
          type?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          deal_id?: string;
          id?: string;
          sent_at?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follow_up_log_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follow_up_log_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          agent_id: string;
          created_at: string;
          id: string;
          link: string | null;
          message: string;
          read: boolean;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          message: string;
          read?: boolean;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          message?: string;
          read?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      participant_doc_requirements: {
        Row: {
          client_id: string;
          created_at: string;
          deal_id: string;
          document_type: string;
          id: string;
          is_required: boolean;
          request_sent_at: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          deal_id: string;
          document_type: string;
          id?: string;
          is_required?: boolean;
          request_sent_at?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          deal_id?: string;
          document_type?: string;
          id?: string;
          is_required?: boolean;
          request_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "participant_doc_requirements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participant_doc_requirements_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      upload_tokens: {
        Row: {
          client_id: string;
          created_at: string;
          deal_id: string;
          expires_at: string;
          id: string;
          token: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          deal_id: string;
          expires_at: string;
          id?: string;
          token?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          deal_id?: string;
          expires_at?: string;
          id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upload_tokens_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "upload_tokens_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_agent_agency_id: { Args: { _user_id: string }; Returns: string };
      get_agent_id: { Args: { _user_id: string }; Returns: string };
      get_ia_tools: { Args: never; Returns: Json };
      get_table_columns: { Args: never; Returns: Json };
      is_agency_admin: { Args: { _user_id: string }; Returns: boolean };
      list_public_tables: {
        Args: never;
        Returns: {
          table_name: string;
        }[];
      };
      onboard_agent: {
        Args: {
          _agency_name: string;
          _agent_email: string;
          _agent_name: string;
          _agent_phone?: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      agent_role: "admin" | "agent";
      certificate_type:
        | "electrical"
        | "gas"
        | "beetle"
        | "electric_fence"
        | "plumbing";
      client_type: "person" | "company" | "trust";
      deal_status:
        | "active"
        | "pending_docs"
        | "ready"
        | "closed"
        | "unconverted";
      deal_type: "sale" | "rental";
      document_status: "pending" | "verified" | "rejected";
      participant_role: "buyer" | "seller" | "tenant" | "landlord";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
