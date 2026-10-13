import React, { useState, useEffect } from 'react';
import { Search, Shield, Sparkles } from 'lucide-react';
import { getShops } from '../../services/shopService';
import PrintXLogo from '../PrintXLogo';
import '../../styles/workspace.css';

const ShopSidebar = ({ selectedShop, onSelectShop }) => {
  const [shops, setShops] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadShops = async () => {
    setLoading(true);
    const data = await getShops(searchQuery);
    setShops(data);
    setLoading(false);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    const data = await getShops(query);
    setShops(data);
  };

  return (
    <div className="shop-sidebar">
      <div className="sidebar-header">
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder="Search nearby print shops..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="shops-list">
        {loading ? (
          <div className="loading-state">Loading shops...</div>
        ) : shops.length === 0 ? (
          <div className="empty-state">No shops found</div>
        ) : (
          shops.map((shop) => (
            <div
              key={shop.id}
              className={`shop-card ${selectedShop?.id === shop.id ? 'active' : ''} ${shop.isPrintX ? 'printx-shop' : ''}`}
              onClick={() => onSelectShop(shop)}
            >
              <div className="shop-header">
                {shop.isPrintX ? (
                  <div className="shop-name-with-logo">
                    <PrintXLogo size={20} showText={false} />
                    <h3 className="shop-name">{shop.name}</h3>
                  </div>
                ) : (
                  <h3 className="shop-name">{shop.name}</h3>
                )}
              </div>

              <div className="shop-badges">
                {shop.verified && (
                  <div className="badge badge-verified">
                    <Shield size={12} />
                    <span>Privacy Verified</span>
                  </div>
                )}
                {shop.aiEnabled && (
                  <div className="badge badge-ai">
                    <Sparkles size={12} />
                    <span>AI Enabled</span>
                  </div>
                )}
              </div>

              {/* No fabricated distance/rating/availability — PrintX Lab is the
                  single official demo lab for the MVP. */}
              <div className="shop-meta">
                <span className="shop-location official">Official Demo Lab</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ShopSidebar;
