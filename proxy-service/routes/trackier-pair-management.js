/**
 * Pair Management API Endpoints
 * For managing campaign pairs within a Trackier offer
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRACKIER_ENABLED = process.env.TRACKIER_ENABLED !== 'false';

// Update pair name or enabled status
router.patch('/trackier-pair/:offerId/:pairIndex', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { offerId, pairIndex } = req.params;
    const { pair_name, enabled } = req.body;
    
    const pairIdx = parseInt(pairIndex) - 1; // Convert to 0-based array index
    
    if (isNaN(pairIdx) || pairIdx < 0) {
      return res.status(400).json({ error: 'Invalid pair_index' });
    }

    console.log(`[Trackier Pair Update] Updating pair ${pairIndex} for offer ${offerId}`);

    // Fetch current offer
    const { data: offer, error: fetchError } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (fetchError || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (!offer.additional_pairs || !offer.additional_pairs[pairIdx]) {
      return res.status(404).json({ error: 'Pair not found' });
    }

    // Update the pair
    const updatedPairs = [...offer.additional_pairs];
    if (pair_name !== undefined) {
      updatedPairs[pairIdx].pair_name = pair_name;
    }
    if (enabled !== undefined) {
      updatedPairs[pairIdx].enabled = enabled;
    }

    // Save back to database
    const { error: updateError } = await supabase
      .from('trackier_offers')
      .update({ additional_pairs: updatedPairs, updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (updateError) {
      throw updateError;
    }

    res.json({ 
      success: true, 
      message: 'Pair updated successfully',
      pair: updatedPairs[pairIdx]
    });
  } catch (error) {
    console.error('[Trackier Pair Update] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Soft delete pair (set enabled = false)
router.delete('/trackier-pair/:offerId/:pairIndex', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { offerId, pairIndex } = req.params;
    const pairIdx = parseInt(pairIndex) - 1;
    
    if (isNaN(pairIdx) || pairIdx < 0) {
      return res.status(400).json({ error: 'Invalid pair_index' });
    }

    // Don't allow deleting pair 1 (primary pair)
    if (pairIdx === 0) {
      return res.status(400).json({ error: 'Cannot delete primary pair (Pair 1)' });
    }

    console.log(`[Trackier Pair Delete] Soft deleting pair ${pairIndex} for offer ${offerId}`);

    // Fetch current offer
    const { data: offer, error: fetchError } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (fetchError || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (!offer.additional_pairs || !offer.additional_pairs[pairIdx]) {
      return res.status(404).json({ error: 'Pair not found' });
    }

    // Soft delete by setting enabled = false
    const updatedPairs = [...offer.additional_pairs];
    updatedPairs[pairIdx].enabled = false;

    const { error: updateError } = await supabase
      .from('trackier_offers')
      .update({ additional_pairs: updatedPairs, updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (updateError) {
      throw updateError;
    }

    res.json({ 
      success: true, 
      message: `Pair ${pairIndex} disabled successfully`
    });
  } catch (error) {
    console.error('[Trackier Pair Delete] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get aggregate statistics for all pairs
router.get('/trackier-aggregate-stats/:offerId', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { offerId } = req.params;

    const { data: offer, error } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (error || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const pairs = offer.additional_pairs || [];
    const enabledPairs = pairs.filter(p => p.enabled !== false);

    const stats = {
      offer_id: offerId,
      offer_name: offer.offer_name,
      total_pairs: pairs.length,
      enabled_pairs: enabledPairs.length,
      total_webhook_count: enabledPairs.reduce((sum, p) => sum + (p.webhook_count || 0), 0),
      total_update_count: enabledPairs.reduce((sum, p) => sum + (p.update_count || 0), 0),
      last_webhook_at: enabledPairs.reduce((latest, p) => {
        if (!p.last_webhook_at) return latest;
        if (!latest) return p.last_webhook_at;
        return new Date(p.last_webhook_at) > new Date(latest) ? p.last_webhook_at : latest;
      }, null),
      pairs: pairs.map(p => ({
        pair_index: p.pair_index,
        pair_name: p.pair_name,
        enabled: p.enabled !== false,
        webhook_count: p.webhook_count || 0,
        update_count: p.update_count || 0,
        last_webhook_at: p.last_webhook_at
      }))
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('[Trackier Aggregate Stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
