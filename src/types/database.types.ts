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
      assigned_packages: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          plan_id: string
          price_paise: number
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          plan_id: string
          price_paise: number
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          plan_id?: string
          price_paise?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assigned_packages_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_packages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "prepaid_package_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_docs: {
        Row: {
          doc_type: Database["public"]["Enums"]["compliance_doc_type"]
          file_url: string | null
          generated_at: string
          id: string
          metadata: Json
          organization_id: string
          pickup_id: string | null
        }
        Insert: {
          doc_type: Database["public"]["Enums"]["compliance_doc_type"]
          file_url?: string | null
          generated_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          pickup_id?: string | null
        }
        Update: {
          doc_type?: Database["public"]["Enums"]["compliance_doc_type"]
          file_url?: string | null
          generated_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          pickup_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_docs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_docs_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          license_number: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          license_number: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          license_number?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      farmer_details: {
        Row: {
          capacity_kg_per_month: number | null
          compost_types: string[] | null
          created_at: string | null
          farm_address: string | null
          farm_lat: number | null
          farm_lng: number | null
          farm_name: string | null
          id: string
          land_area_acres: number | null
          notes: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          capacity_kg_per_month?: number | null
          compost_types?: string[] | null
          created_at?: string | null
          farm_address?: string | null
          farm_lat?: number | null
          farm_lng?: number | null
          farm_name?: string | null
          id?: string
          land_area_acres?: number | null
          notes?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          capacity_kg_per_month?: number | null
          compost_types?: string[] | null
          created_at?: string | null
          farm_address?: string | null
          farm_lat?: number | null
          farm_lng?: number | null
          farm_name?: string | null
          id?: string
          land_area_acres?: number | null
          notes?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paise: number
          created_at: string
          due_date: string | null
          id: string
          organization_id: string
          paid_at: string | null
          pickup_id: string | null
          razorpay_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tax_paise: number
          total_paise: number | null
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          due_date?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          pickup_id?: string | null
          razorpay_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tax_paise?: number
          total_paise?: number | null
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          due_date?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          pickup_id?: string | null
          razorpay_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tax_paise?: number
          total_paise?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string
          city: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          gstin: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          pan: string | null
          pincode: string | null
          registration_number: string | null
          signatory_designation: string | null
          signatory_name: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          address: string
          city?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          gstin?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          pan?: string | null
          pincode?: string | null
          registration_number?: string | null
          signatory_designation?: string | null
          signatory_name?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          address?: string
          city?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          gstin?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          org_type?: Database["public"]["Enums"]["org_type"]
          pan?: string | null
          pincode?: string | null
          registration_number?: string | null
          signatory_designation?: string | null
          signatory_name?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: []
      }
      pickup_events: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          pickup_id: string
          status: Database["public"]["Enums"]["pickup_status"]
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          pickup_id: string
          status: Database["public"]["Enums"]["pickup_status"]
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          pickup_id?: string
          status?: Database["public"]["Enums"]["pickup_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pickup_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_events_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_trips: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          photo_metadata: Json
          photo_urls: string[]
          pickup_id: string
          started_at: string
          status: Database["public"]["Enums"]["trip_status"]
          trip_number: number
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          photo_metadata?: Json
          photo_urls?: string[]
          pickup_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["trip_status"]
          trip_number: number
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          photo_metadata?: Json
          photo_urls?: string[]
          pickup_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["trip_status"]
          trip_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pickup_trips_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      pickups: {
        Row: {
          actual_weight_kg: number | null
          created_at: string
          delivered_at: string | null
          estimated_weight_kg: number | null
          farmer_id: string | null
          farmer_responded_at: string | null
          id: string
          loading_helper_required: boolean
          notes: string | null
          organization_id: string
          photo_after_url: string | null
          photo_before_url: string | null
          pickup_number: string | null
          prepaid_package_id: string | null
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          rejection_reason: string | null
          requested_by: string
          scheduled_date: string
          scheduled_slot: string | null
          status: Database["public"]["Enums"]["pickup_status"]
          updated_at: string
          vehicle_id: string | null
          waste_photo_urls: string[] | null
        }
        Insert: {
          actual_weight_kg?: number | null
          created_at?: string
          delivered_at?: string | null
          estimated_weight_kg?: number | null
          farmer_id?: string | null
          farmer_responded_at?: string | null
          id?: string
          loading_helper_required?: boolean
          notes?: string | null
          organization_id: string
          photo_after_url?: string | null
          photo_before_url?: string | null
          pickup_number?: string | null
          prepaid_package_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          rejection_reason?: string | null
          requested_by: string
          scheduled_date: string
          scheduled_slot?: string | null
          status?: Database["public"]["Enums"]["pickup_status"]
          updated_at?: string
          vehicle_id?: string | null
          waste_photo_urls?: string[] | null
        }
        Update: {
          actual_weight_kg?: number | null
          created_at?: string
          delivered_at?: string | null
          estimated_weight_kg?: number | null
          farmer_id?: string | null
          farmer_responded_at?: string | null
          id?: string
          loading_helper_required?: boolean
          notes?: string | null
          organization_id?: string
          photo_after_url?: string | null
          photo_before_url?: string | null
          pickup_number?: string | null
          prepaid_package_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          rejection_reason?: string | null
          requested_by?: string
          scheduled_date?: string
          scheduled_slot?: string | null
          status?: Database["public"]["Enums"]["pickup_status"]
          updated_at?: string
          vehicle_id?: string | null
          waste_photo_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pickups_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickups_prepaid_package_id_fkey"
            columns: ["prepaid_package_id"]
            isOneToOne: false
            referencedRelation: "prepaid_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickups_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickups_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      prepaid_package_plans: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          pickup_count: number
          updated_at: string | null
          validity_days: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pickup_count: number
          updated_at?: string | null
          validity_days: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pickup_count?: number
          updated_at?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "prepaid_package_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prepaid_packages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string
          pickup_count: number
          plan_id: string | null
          requested_by: string
          status: Database["public"]["Enums"]["prepaid_package_status"]
          updated_at: string
          used_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          pickup_count: number
          plan_id?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["prepaid_package_status"]
          updated_at?: string
          used_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          pickup_count?: number
          plan_id?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["prepaid_package_status"]
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "prepaid_packages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_packages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "prepaid_package_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prepaid_packages_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          kyc_notes: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_notes?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          organization_id: string
          plan: string
          price_paise: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          plan?: string
          price_paise?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          plan?: string
          price_paise?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          doc_type: Database["public"]["Enums"]["vehicle_doc_type"]
          expires_at: string | null
          file_path: string
          id: string
          uploaded_at: string
          uploaded_by: string
          vehicle_id: string
        }
        Insert: {
          doc_type: Database["public"]["Enums"]["vehicle_doc_type"]
          expires_at?: string | null
          file_path: string
          id?: string
          uploaded_at?: string
          uploaded_by: string
          vehicle_id: string
        }
        Update: {
          doc_type?: Database["public"]["Enums"]["vehicle_doc_type"]
          expires_at?: string | null
          file_path?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_drivers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          driver_id: string
          id: string
          vehicle_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          driver_id: string
          id?: string
          vehicle_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          driver_id?: string
          id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_drivers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_drivers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_drivers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_kg: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          registration_number: string
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          capacity_kg?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          registration_number: string
          updated_at?: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          capacity_kg?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          registration_number?: string
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_org_ids: { Args: never; Returns: string[] }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      compliance_doc_type:
        | "manifest"
        | "receipt"
        | "certificate"
        | "report"
        | "agreement"
      kyc_status: "pending" | "submitted" | "verified" | "rejected"
      org_type: "apartment" | "rwa" | "techpark"
      payment_status: "pending" | "paid" | "overdue" | "cancelled"
      pickup_status:
        | "requested"
        | "verified"
        | "assigned"
        | "driver_accepted"
        | "driver_not_accepted"
        | "breakdown"
        | "enroute"
        | "arrived_bwg"
        | "full_pickup"
        | "partial_pickup"
        | "in_transit"
        | "arrived_processor"
        | "accepted"
        | "rejected"
        | "processed"
        | "cancelled"
        | "picked_up"
        | "delivered"
        | "received"
        | "scheduled"
      prepaid_package_status: "pending" | "approved" | "rejected" | "expired" | "exhausted"
      recurrence_type: "one_time" | "weekly" | "biweekly" | "monthly"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      trip_status: "in_transit" | "delivered"
      user_role: "bwg" | "collector" | "farmer" | "admin"
      vehicle_doc_type:
        | "rc"
        | "insurance"
        | "tax_receipt"
        | "emission_cert"
        | "fitness_cert"
      vehicle_type:
        | "auto"
        | "mini_truck"
        | "truck"
        | "tempo"
        | "pickup"
        | "light_truck"
        | "medium_truck"
        | "tipper"
        | "trolley"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      compliance_doc_type: [
        "manifest",
        "receipt",
        "certificate",
        "report",
        "agreement",
      ],
      kyc_status: ["pending", "submitted", "verified", "rejected"],
      org_type: ["apartment", "rwa", "techpark"],
      payment_status: ["pending", "paid", "overdue", "cancelled"],
      pickup_status: [
        "requested",
        "verified",
        "assigned",
        "driver_accepted",
        "driver_not_accepted",
        "breakdown",
        "enroute",
        "arrived_bwg",
        "full_pickup",
        "partial_pickup",
        "in_transit",
        "arrived_processor",
        "accepted",
        "rejected",
        "processed",
        "cancelled",
        "picked_up",
        "delivered",
        "received",
        "scheduled",
      ],
      prepaid_package_status: ["pending", "approved", "rejected", "expired", "exhausted"],
      recurrence_type: ["one_time", "weekly", "biweekly", "monthly"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      trip_status: ["in_transit", "delivered"],
      user_role: ["bwg", "collector", "farmer", "admin"],
      vehicle_doc_type: [
        "rc",
        "insurance",
        "tax_receipt",
        "emission_cert",
        "fitness_cert",
      ],
      vehicle_type: [
        "auto",
        "mini_truck",
        "truck",
        "tempo",
        "pickup",
        "light_truck",
        "medium_truck",
        "tipper",
        "trolley",
      ],
    },
  },
} as const
