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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cashback_credits: {
        Row: {
          amount: number
          created_at: string
          expires_at: string | null
          id: string
          order_id: string | null
          status: string
          updated_at: string
          used_amount: number
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          status?: string
          updated_at?: string
          used_amount?: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          status?: string
          updated_at?: string
          used_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_credits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          buyer_id: string
          buyer_name: string | null
          buyer_unread: number
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string
          partner_id: string | null
          product_id: string | null
          product_name: string | null
          seller_unread: number
        }
        Insert: {
          buyer_id: string
          buyer_name?: string | null
          buyer_unread?: number
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          partner_id?: string | null
          product_id?: string | null
          product_name?: string | null
          seller_unread?: number
        }
        Update: {
          buyer_id?: string
          buyer_name?: string | null
          buyer_unread?: number
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          partner_id?: string | null
          product_id?: string | null
          product_name?: string | null
          seller_unread?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          read: boolean
          sender_id: string
          sender_name: string | null
          sender_role: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          read?: boolean
          sender_id: string
          sender_name?: string | null
          sender_role: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          read?: boolean
          sender_id?: string
          sender_name?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      followers: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          city: string | null
          complement: string | null
          cost_total: number
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          items: Json
          mp_payment_id: string | null
          mp_preference_id: string | null
          neighborhood: string | null
          notes: string | null
          number: string | null
          paid_at: string | null
          payment_method: string | null
          payment_type: string | null
          profit: number
          recipient_name: string | null
          recipient_phone: string | null
          reference: string | null
          state: string | null
          status: string
          street: string | null
          subtotal: number
          total: number
          updated_at: string
          user_id: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          cost_total?: number
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          items?: Json
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string | null
          profit?: number
          recipient_name?: string | null
          recipient_phone?: string | null
          reference?: string | null
          state?: string | null
          status?: string
          street?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          cost_total?: number
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          items?: Json
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string | null
          profit?: number
          recipient_name?: string | null
          recipient_phone?: string | null
          reference?: string | null
          state?: string | null
          status?: string
          street?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      partner_orders: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_user_id: string | null
          delivered_at: string | null
          id: string
          items: Json
          order_id: string | null
          partner_id: string
          partner_net: number
          shipped_at: string | null
          shipping_address: Json | null
          shipping_cost: number
          status: string
          subtotal: number
          total: number
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          delivered_at?: string | null
          id?: string
          items?: Json
          order_id?: string | null
          partner_id: string
          partner_net?: number
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          delivered_at?: string | null
          id?: string
          items?: Json
          order_id?: string | null
          partner_id?: string
          partner_net?: number
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          total?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          available_at: string | null
          commission_amount: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          partner_id: string
          partner_order_id: string | null
          payout_method: string | null
          payout_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          available_at?: string | null
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          partner_id: string
          partner_order_id?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          available_at?: string | null
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          partner_id?: string
          partner_order_id?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payouts_partner_order_id_fkey"
            columns: ["partner_order_id"]
            isOneToOne: false
            referencedRelation: "partner_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_products: {
        Row: {
          active: boolean
          approval_status: string
          brand: string | null
          category: string | null
          cost_price: number
          created_at: string
          description: string | null
          discount_price: number | null
          height_cm: number | null
          id: string
          image_url: string | null
          images: string[]
          length_cm: number | null
          name: string
          notes: string | null
          partner_id: string
          price: number
          sku: string | null
          stock_quantity: number
          subcategory: string | null
          updated_at: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          active?: boolean
          approval_status?: string
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_price?: number | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          length_cm?: number | null
          name: string
          notes?: string | null
          partner_id: string
          price?: number
          sku?: string | null
          stock_quantity?: number
          subcategory?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          active?: boolean
          approval_status?: string
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_price?: number | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          length_cm?: number | null
          name?: string
          notes?: string | null
          partner_id?: string
          price?: number
          sku?: string | null
          stock_quantity?: number
          subcategory?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_products_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          approved_at: string | null
          banner_url: string | null
          commission_rate: number | null
          cover_url: string | null
          created_at: string
          descricao: string | null
          direct_checkout_enabled: boolean
          documento: string
          email: string | null
          endereco: Json | null
          id: string
          level_manual: string | null
          logo_url: string | null
          nome: string
          nome_loja: string
          rejection_reason: string | null
          reliable_shipping: boolean
          slug: string
          status: string
          store_banners: Json
          telefone: string | null
          tipo: string
          updated_at: string
          user_id: string | null
          verified: boolean
        }
        Insert: {
          approved_at?: string | null
          banner_url?: string | null
          commission_rate?: number | null
          cover_url?: string | null
          created_at?: string
          descricao?: string | null
          direct_checkout_enabled?: boolean
          documento: string
          email?: string | null
          endereco?: Json | null
          id?: string
          level_manual?: string | null
          logo_url?: string | null
          nome: string
          nome_loja: string
          rejection_reason?: string | null
          reliable_shipping?: boolean
          slug: string
          status?: string
          store_banners?: Json
          telefone?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string | null
          verified?: boolean
        }
        Update: {
          approved_at?: string | null
          banner_url?: string | null
          commission_rate?: number | null
          cover_url?: string | null
          created_at?: string
          descricao?: string | null
          direct_checkout_enabled?: boolean
          documento?: string
          email?: string | null
          endereco?: Json | null
          id?: string
          level_manual?: string | null
          logo_url?: string | null
          nome?: string
          nome_loja?: string
          rejection_reason?: string | null
          reliable_shipping?: boolean
          slug?: string
          status?: string
          store_banners?: Json
          telefone?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json
          created_at: string
          discount_price: number | null
          id: string
          image_url: string | null
          name: string
          partner_product_id: string | null
          price: number
          product_id: string | null
          sku: string | null
          stock: number
        }
        Insert: {
          attributes?: Json
          created_at?: string
          discount_price?: number | null
          id?: string
          image_url?: string | null
          name: string
          partner_product_id?: string | null
          price?: number
          product_id?: string | null
          sku?: string | null
          stock?: number
        }
        Update: {
          attributes?: Json
          created_at?: string
          discount_price?: number | null
          id?: string
          image_url?: string | null
          name?: string
          partner_product_id?: string | null
          price?: number
          product_id?: string | null
          sku?: string | null
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_partner_product_id_fkey"
            columns: ["partner_product_id"]
            isOneToOne: false
            referencedRelation: "partner_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category: string | null
          cost_price: number
          created_at: string
          description: string | null
          discount_price: number | null
          id: string
          image_url: string | null
          images: string[]
          name: string
          notes: string | null
          price: number
          sku: string | null
          stock_quantity: number
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          name: string
          notes?: string | null
          price?: number
          sku?: string | null
          stock_quantity?: number
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          name?: string
          notes?: string | null
          price?: number
          sku?: string | null
          stock_quantity?: number
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birthday: string | null
          cnpj: string | null
          created_at: string
          full_name: string | null
          id: string
          level: string | null
          lifetime_spent: number
          phone: string | null
          pix_key: string | null
          updated_at: string
          user_type: string | null
        }
        Insert: {
          birthday?: string | null
          cnpj?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          level?: string | null
          lifetime_spent?: number
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Update: {
          birthday?: string | null
          cnpj?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          level?: string | null
          lifetime_spent?: number
          phone?: string | null
          pix_key?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Relationships: []
      }
      store_state: {
        Row: {
          banners: Json
          coupons: Json
          id: string
          products: Json
          settings: Json
          updated_at: string
        }
        Insert: {
          banners?: Json
          coupons?: Json
          id: string
          products?: Json
          settings?: Json
          updated_at?: string
        }
        Update: {
          banners?: Json
          coupons?: Json
          id?: string
          products?: Json
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          available_balance: number
          blocked_balance: number
          created_at: string
          id: string
          pending_balance: number
          total_cashback: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number
          blocked_balance?: number
          created_at?: string
          id?: string
          pending_balance?: number
          total_cashback?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number
          blocked_balance?: number
          created_at?: string
          id?: string
          pending_balance?: number
          total_cashback?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_partner_self: {
        Args: never
        Returns: {
          created: boolean
          slug: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "partner" | "user"
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
      app_role: ["admin", "owner", "partner", "user"],
    },
  },
} as const
