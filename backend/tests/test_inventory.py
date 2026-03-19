import pytest
from fastapi import status


def test_create_item_valid(client, db):
    """Test creating a valid inventory item"""
    item_data = {
        "name": "Test Product",
        "sku": "TEST001",
        "hsn_code": "12345678",
        "gst_rate": 18.0,
        "opening_qty": 100.0,
        "unit": "pieces",
        "min_qty": 10.0,
        "mrp": 150.0,
        "sale_price": 120.0,
        "purchase_price": 100.0
    }
    
    response = client.post("/api/v1/inventory/items", json=item_data)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == "Test Product"
    assert data["sku"] == "TEST001"
    assert data["gst_rate"] == 18.0


def test_create_item_duplicate_sku(client, db):
    """Test creating item with duplicate SKU"""
    item_data = {
        "name": "Test Product 1",
        "sku": "TEST002",
        "unit": "pieces",
        "gst_rate": 5.0,
        "opening_qty": 50.0
    }
    
    # Create first item
    response1 = client.post("/api/v1/inventory/items", json=item_data)
    assert response1.status_code == status.HTTP_200_OK
    
    # Try to create duplicate
    response2 = client.post("/api/v1/inventory/items", json=item_data)
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert response2.json()["detail"]["error"] == "DUPLICATE_SKU"


def test_get_items_pagination(client, db):
    """Test pagination in get items"""
    # Create multiple items
    for i in range(5):
        item_data = {
            "name": f"Product {i}",
            "sku": f"TEST{i:03d}",
            "unit": "pieces",
            "gst_rate": 5.0,
            "opening_qty": 10.0
        }
        client.post("/api/v1/inventory/items", json=item_data)
    
    # Test pagination
    response = client.get("/api/v1/inventory/items?skip=0&limit=3")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 3


def test_search_items(client, db):
    """Test searching items by name and SKU"""
    # Create test items
    items = [
        {"name": "Widget A", "sku": "WID001", "unit": "pieces", "gst_rate": 12.0, "opening_qty": 10.0},
        {"name": "Gadget B", "sku": "GAD001", "unit": "pieces", "gst_rate": 18.0, "opening_qty": 20.0},
    ]
    
    for item in items:
        client.post("/api/v1/inventory/items", json=item)
    
    # Search by name
    response = client.get("/api/v1/inventory/items?search=widget")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert "Widget" in data[0]["name"]
    
    # Search by SKU
    response = client.get("/api/v1/inventory/items?search=GAD")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1


def test_stock_transactions(client, db):
    """Test stock transactions (purchase and sale)"""
    # Create item
    item_data = {
        "name": "Stock Test Product",
        "sku": "STOCK001",
        "unit": "pieces",
        "gst_rate": 5.0,
        "opening_qty": 100.0,
        "sale_price": 50.0,
        "purchase_price": 40.0
    }
    response = client.post("/api/v1/inventory/items", json=item_data)
    item_id = response.json()["id"]
    
    # Create purchase transaction
    purchase_data = {
        "item_id": item_id,
        "date": "2024-01-15",
        "type": "purchase",
        "qty": 50.0
    }
    response = client.post("/api/v1/inventory/stock-transactions", json=purchase_data)
    assert response.status_code == status.HTTP_200_OK
    
    # Create sale transaction
    sale_data = {
        "item_id": item_id,
        "date": "2024-01-16",
        "type": "sale",
        "qty": -25.0
    }
    response = client.post("/api/v1/inventory/stock-transactions", json=sale_data)
    assert response.status_code == status.HTTP_200_OK
    
    # Get summary
    response = client.get("/api/v1/inventory/summary")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Find our item
    item_summary = next((s for s in data if s["item_id"] == item_id), None)
    assert item_summary is not None
    assert item_summary["stock"] == 125.0  # 100 opening + 50 purchase - 25 sale


def test_inventory_summary(client, db):
    """Test inventory summary calculation"""
    # Create item
    item_data = {
        "name": "Summary Test",
        "sku": "SUM001",
        "unit": "pieces",
        "gst_rate": 18.0,
        "opening_qty": 100.0,
        "sale_price": 100.0
    }
    response = client.post("/api/v1/inventory/items", json=item_data)
    item_id = response.json()["id"]
    
    # Get summary
    response = client.get("/api/v1/inventory/summary")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    item_summary = next((s for s in data if s["item_id"] == item_id), None)
    assert item_summary is not None
    assert item_summary["stock"] == 100.0
    assert item_summary["value"] == 10000.0  # 100 * 100


def test_soft_delete(client, db):
    """Test soft delete of inventory item"""
    # Create item
    item_data = {
        "name": "Delete Test",
        "sku": "DEL001",
        "unit": "pieces",
        "gst_rate": 5.0,
        "opening_qty": 10.0
    }
    response = client.post("/api/v1/inventory/items", json=item_data)
    item_id = response.json()["id"]
    
    # Soft delete
    response = client.delete(f"/api/v1/inventory/items/{item_id}")
    assert response.status_code == status.HTTP_200_OK
    
    # Verify item not in list
    response = client.get("/api/v1/inventory/items")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert all(item["id"] != item_id for item in data)

