const { createClient } = require('@supabase/supabase-js');

class SupabaseStorageManager {
  static getClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  static bucket() {
    return process.env.SUPABASE_INVOICES_BUCKET || 'billing-invoices';
  }

  static async upload(path, buffer, contentType) {
    try {
      const supabase = SupabaseStorageManager.getClient();
      const { error } = await supabase.storage
        .from(SupabaseStorageManager.bucket())
        .upload(path, buffer, {
          contentType: contentType || 'application/octet-stream',
          upsert: true,
        });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, path };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async download(path) {
    try {
      const supabase = SupabaseStorageManager.getClient();
      const { data, error } = await supabase.storage
        .from(SupabaseStorageManager.bucket())
        .download(path);
      if (error) {
        return { success: false, error: error.message };
      }
      const arrayBuffer = await data.arrayBuffer();
      return { success: true, buffer: Buffer.from(arrayBuffer) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async createSignedUrl(path, expiresInSeconds = 3600) {
    try {
      const supabase = SupabaseStorageManager.getClient();
      const { data, error } = await supabase.storage
        .from(SupabaseStorageManager.bucket())
        .createSignedUrl(path, expiresInSeconds);
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, url: data.signedUrl };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = SupabaseStorageManager;
